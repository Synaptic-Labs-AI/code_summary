#!/usr/bin/env node

/**
 * CombinedCodeAnalysis.js
 *
 * This script generates a directory tree, obtains an LLM-based analysis
 * of the codebase (including code files), and combines all relevant files
 * into a single Markdown output file. All outputs are organized
 * in a single file with a table of contents for easy navigation.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const axios = require('axios');
require('dotenv').config();

// Promisify fs functions for easier async/await usage
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const appendFile = util.promisify(fs.appendFile);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

// === Configuration ===

// Output file name
const outputFile = 'CodeAnalysis.md';

// Excluded directories and files
const excludedDirs = [
  '.vscode',
  'node_modules',
  '.git',
  'dist',
  'build',
  '.svelte-kit'
];
const excludedFiles = [
  'main.js',
  outputFile,
  'codeSummary.cjs',
  'package-lock.json',
  'yarn.lock',
  '.env',
  '*.log',
  '*.tmp',
  '.gitignore',
];

// OpenRouter API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const YOUR_SITE_URL = process.env.YOUR_SITE_URL || '';
const YOUR_SITE_NAME = process.env.YOUR_SITE_NAME || '';

// Validate API Key
if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY is not set in the .env file.');
  process.exit(1);
}

/**
 * Function to generate directory tree using improved ASCII characters
 * Similar to the standard `tree` command output.
 *
 * @param {string} dir - The directory path to start from
 * @param {string} prefix - The prefix for the current level
 * @param {boolean} isLast - Indicates if the current item is the last in its parent
 * @param {Array} excludeDirs - List of directories to exclude
 * @param {Array} excludeFiles - List of files to exclude from the tree
 * @returns {string} - The formatted directory tree as a string
 */
async function generateDirectoryTree(
  dir,
  prefix = '',
  isLast = true,
  excludeDirs = [],
  excludeFiles = []
) {
  let tree = '';
  const items = await getSortedItems(dir, excludeDirs, excludeFiles);
  const totalItems = items.length;

  for (let i = 0; i < totalItems; i++) {
    const item = items[i];
    const isLastItem = i === totalItems - 1;
    const connector = isLastItem ? '└── ' : '├── ';
    tree += `${prefix}${connector}${item.name}\n`;

    if (item.isDirectory) {
      const newPrefix = prefix + (isLastItem ? '    ' : '│   ');
      tree += await generateDirectoryTree(
        item.path,
        newPrefix,
        isLastItem,
        excludeDirs,
        excludeFiles
      );
    }
  }

  return tree;
}

/**
 * Helper function to get sorted items in a directory
 * Directories are listed before files, both sorted alphabetically
 *
 * @param {string} dir - Directory path
 * @param {Array} excludeDirs - List of directories to exclude
 * @param {Array} excludeFiles - List of files to exclude from the tree
 * @returns {Array} - Sorted list of items with their paths and types
 */
async function getSortedItems(dir, excludeDirs = [], excludeFiles = []) {
  const rawItems = await readdir(dir, { withFileTypes: true });
  const filteredItems = rawItems.filter((item) => {
    // Exclude specified directories
    if (item.isDirectory() && excludeDirs.includes(item.name)) {
      return false;
    }
    // Exclude specified files
    if (item.isFile() && isExcluded(item.name)) {
      return false;
    }
    return true;
  });

  // Sort: Directories first, then files; both alphabetically
  const sortedDirs = filteredItems
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const sortedFiles = filteredItems
    .filter((item) => !item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const sortedItems = [...sortedDirs, ...sortedFiles];

  // Map to include full path and type
  return sortedItems.map((item) => ({
    name: item.name,
    path: path.join(dir, item.name),
    isDirectory: item.isDirectory(),
  }));
}

/**
 * Function to check if a file or directory should be excluded
 * Supports wildcard patterns like '*.log'
 * @param {string} name - The file or directory name
 * @returns {boolean} - True if excluded, false otherwise
 */
function isExcluded(name) {
  for (const pattern of excludedFiles) {
    if (pattern.startsWith('*')) {
      // Handle wildcard patterns
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) return true;
    } else {
      if (name === pattern) return true;
    }
  }
  return false;
}

/**
 * Function to read file content with size limitation
 * @param {string} filePath - The path of the file to read
 * @param {number} maxSize - Maximum allowed file size in bytes
 * @returns {string|null} - The file content or null if exceeds size limit
 */
function readFileContent(filePath, maxSize = 1000000) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxSize) {
      console.warn(
        `Warning: Skipping ${filePath} as it exceeds the size limit of ${maxSize} bytes.`
      );
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (err) {
    console.error(`Error: Unable to read file ${filePath}.`, err);
    return null;
  }
}

/**
 * Helper function to get all files recursively in a directory
 *
 * @param {string} dir - Directory path
 * @param {Array} excludeDirs - List of directories to exclude
 * @param {Array} excludeFiles - List of files to exclude
 * @returns {Array} - List of file paths
 */
async function getAllFiles(dir, excludeDirs = [], excludeFiles = []) {
  let filesList = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!excludeDirs.includes(item.name)) {
        const nestedFiles = await getAllFiles(fullPath, excludeDirs, excludeFiles);
        filesList = filesList.concat(nestedFiles);
      }
    } else {
      if (!isExcluded(item.name)) {
        filesList.push(fullPath);
      }
    }
  }

  return filesList;
}

/**
 * Function to send data to OpenRouter API
 * @param {string} prompt - The prompt to send to the LLM
 * @returns {string} - The LLM's response
 */
async function sendToOpenRouter(prompt) {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'openai/o1-mini', // Using the specified model
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': YOUR_SITE_URL, // Optional
          'X-Title': YOUR_SITE_NAME, // Optional
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content.trim();
    } else {
      console.warn('Warning: No response content from OpenRouter API.');
      return '';
    }
  } catch (error) {
    console.error('Error: Communication with OpenRouter API failed.');
    if (error.response) {
      console.error('Status Code:', error.response.status);
      console.error('Response Data:', error.response.data);
    } else {
      console.error('Error Message:', error.message);
    }
    return '';
  }
}

/**
 * Function to analyze the codebase using LLM and return the analysis content
 * @param {string} directoryTree - The directory tree as a string
 * @param {Object} fileData - An object containing file paths and their content
 * @returns {string} - The analysis content
 */
async function analyzeCodebase(directoryTree, fileData) {
  console.log('Analyzing codebase using LLM...');

  if (Object.keys(fileData).length === 0) {
    console.error('Error: No files available for analysis.');
    return '';
  }

  // Prepare prompt for LLM
  const prompt = `
Act as an expert in analyzing and improving codebases. I have a codebase with the following directory structure:

\`\`\`
${directoryTree.trim()}
\`\`\`

Below are the files and their contents:

${Object.entries(fileData)
    .map(
      ([file, content]) =>
        `### ${file}\n\`\`\`${path.extname(file).substring(1) || 'txt'}\n${content}\n\`\`\``
    )
    .join('\n\n')}

You will provide a detailed analysis of the codebase, including:

- A summary of what the codebase does.
- A one sentence purpose of the main directories and files.
- How the different parts of the codebase interact with each other as [[wikilinks]]. (e.g. [[index.js]] orchestrates [[test.js]], [[blank.js]] and [[operation.js]])
- Any SPECIFIC improvements or best practices that could be applied.

Please be thorough and avoid including code snippets in your response.
`;

  // Send prompt to OpenRouter
  const analysis = await sendToOpenRouter(prompt);

  if (analysis) {
    return analysis;
  } else {
    console.error('Error: No analysis was received from OpenRouter.');
    return '';
  }
}

/**
 * Function to generate a table of contents based on the sections added
 * @param {Array} sections - List of section names
 * @returns {string} - The table of contents in Markdown format
 */
function generateTableOfContents(sections) {
  let toc = '# Table of Contents\n\n';
  sections.forEach((section) => {
    const anchor = section.toLowerCase().replace(/\s+/g, '-');
    toc += `- [${section}](#${anchor})\n`;
  });
  toc += '\n';
  return toc;
}

/**
 * Main function to orchestrate the script
 */
async function main() {
  try {
    // Initialize or clear the output file
    await writeFile(outputFile, '', 'utf8');
    console.log(`Initialized ${outputFile}`);

    const sections = {};

    // Generate directory tree
    console.log('Generating directory tree...');
    const directoryTree = await generateDirectoryTree('.', '', true, excludedDirs, excludedFiles);
    sections['Directory'] = '```\n' + directoryTree + '\n```';
    console.log('Generated directory tree.');

    // Collect all files for analysis and for adding to output
    console.log('Collecting files...');
    const allFiles = await getAllFiles('.', excludedDirs, excludedFiles);
    const fileData = {};

    for (const filePath of allFiles) {
      const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join('/');
      const content = readFileContent(filePath);
      if (content !== null) {
        fileData[relativePath] = content;
      }
    }

    // Analyze codebase using LLM
    console.log('Analyzing codebase...');
    const analysis = await analyzeCodebase(sections['Directory'], fileData);
    sections['Analysis'] = analysis;

    // Prepare Code Files section
    console.log('Preparing Code Files section...');
    let codeFilesContent = '';
    for (const [relativePath, content] of Object.entries(fileData)) {
      codeFilesContent += `## ${relativePath}\n\n`;
      const fileExtension = path.extname(relativePath).substring(1) || '';
      codeFilesContent += '```' + fileExtension + '\n' + content + '\n```\n\n';
    }
    sections['Code Files'] = codeFilesContent;

    // Generate table of contents
    console.log('Generating table of contents...');
    const toc = generateTableOfContents(Object.keys(sections));

    // Write all content to the output file
    console.log('Writing content to the output file...');
    let finalContent = '';
    finalContent += toc;
    for (const sectionName of ['Directory', 'Analysis', 'Code Files']) {
      finalContent += `# ${sectionName}\n\n`;
      finalContent += sections[sectionName];
      finalContent += '\n\n';
    }
    await writeFile(outputFile, finalContent, 'utf8');

    console.log(`File '${outputFile}' has been successfully created.`);
  } catch (err) {
    console.error(`An error occurred: ${err.message}`);
  }
}

// Execute the main function
main();
