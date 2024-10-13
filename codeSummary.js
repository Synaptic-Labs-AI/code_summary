#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Command } = require('commander');
require('dotenv').config();

// === Configuration ===

// List of directories and files to exclude
const EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.vscode',
  '*.log',          // Exclude all .log files
  '*.tmp',          // Exclude all .tmp files
  'package-lock.json',
  'yarn.lock'
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

// Initialize Commander for CLI
const program = new Command();

program
  .name('codeSummary')
  .description('Generate directory tree or analyze codebase.')
  .version('1.0.0');

// Define Command-Line Options
program
  .option('-g, --generate', 'Generate a text-based directory tree of the current project.')
  .option('-a, --analyze', 'Analyze the codebase by sending file contents to OpenRouter.');

program.parse(process.argv);

// Extract options
const options = program.opts();

// Function to check if a file or directory should be excluded
function isExcluded(name) {
  for (const pattern of EXCLUDE) {
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

// Function to get the project name from package.json or folder name
function getProjectName(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name) {
        return packageJson.name;
      } else {
        console.warn('Warning: "name" field not found in package.json. Using parent folder name as project name.');
      }
    } catch (error) {
      console.warn('Warning: Could not parse package.json to get project name. Using parent folder name as project name.');
    }
  } else {
    console.warn('Warning: package.json not found. Using parent folder name as project name.');
  }
  // Fallback to folder name
  return path.basename(projectPath);
}

// Function to format current date and time
function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// Function to build directory tree
function buildDirectoryTree(dirPath, prefix = '') {
  let tree = '';
  let items;
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    console.error(`Error: Unable to read directory ${dirPath}.`, err);
    return tree;
  }

  // Filter out excluded files and directories
  const filteredItems = items.filter(item => !isExcluded(item.name));

  const totalItems = filteredItems.length;
  filteredItems.forEach((item, index) => {
    const isLast = index === totalItems - 1;
    const pointer = isLast ? '└── ' : '├── ';
    tree += `${prefix}${pointer}${item.name}\n`;

    if (item.isDirectory()) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      tree += buildDirectoryTree(path.join(dirPath, item.name), newPrefix);
    }
  });
  return tree;
}

// Function to generate directory tree
function mainGenerate() {
  console.log('=== Directory Tree Generation Started ===');

  const projectPath = process.cwd();
  const projectName = getProjectName(projectPath);
  const dateTime = getFormattedDateTime();
  const outputFileName = `${projectName}_directory_${dateTime}.txt`;
  const outputPath = path.join(projectPath, outputFileName);

  console.log(`Project Name: ${projectName}`);
  console.log(`Generating directory tree at: ${outputPath}`);

  const directoryTree = buildDirectoryTree(projectPath);

  try {
    fs.writeFileSync(outputPath, directoryTree, 'utf8');
    console.log(`Success: Directory tree has been saved to ${outputFileName}`);
  } catch (err) {
    console.error('Error: Failed to write directory tree to file.', err);
  }

  console.log('=== Directory Tree Generation Completed ===');
}

// Function to recursively get all files in the directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  files.forEach(file => {
    if (!isExcluded(file.name)) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      } else if (file.isFile()) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

// Function to read file content with size limitation
function readFileContent(filePath, maxSize = 1000000) { // 1MB limit
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxSize) {
      console.warn(`Warning: Skipping ${filePath} as it exceeds the size limit of ${maxSize} bytes.`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (err) {
    console.error(`Error: Unable to read file ${filePath}.`, err);
    return null;
  }
}

// Function to send data to OpenRouter API
async function sendToOpenRouter(prompt) {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'openai/o1-mini', // Using the specified model
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': YOUR_SITE_URL, // Optional
          'X-Title': YOUR_SITE_NAME,     // Optional
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content.trim();
    } else {
      console.warn('Warning: No response content from OpenRouter API.');
      return '';
    }
  } catch (error) {
    console.error('Error: Communication with OpenRouter API failed.', error.response ? error.response.data : error.message);
    return '';
  }
}

// Function to analyze codebase
async function mainAnalyze() {
  console.log('=== Codebase Analysis Started ===');

  const projectPath = process.cwd();
  const projectName = getProjectName(projectPath);
  const dateTime = getFormattedDateTime();
  const outputFileName = `${projectName}_analysis_${dateTime}.txt`;
  const outputPath = path.join(projectPath, outputFileName);

  console.log(`Project Name: ${projectName}`);
  console.log('Collecting files for analysis...');

  const allFiles = getAllFiles(projectPath);
  console.log(`Total files to analyze: ${allFiles.length}`);

  // Prepare file data
  const fileData = {};
  for (const filePath of allFiles) {
    const relativePath = path.relative(projectPath, filePath);
    const content = readFileContent(filePath);
    if (content !== null) {
      fileData[relativePath] = content;
      console.log(`Collected: ${relativePath}`);
    }
  }

  if (Object.keys(fileData).length === 0) {
    console.error('Error: No files available for analysis.');
    console.log('=== Codebase Analysis Aborted ===');
    return;
  }

  // Generate directory tree
  console.log('Generating directory tree to include in analysis...');
  const directoryTree = buildDirectoryTree(projectPath);
  console.log('Directory tree generation completed.');

  // Prepare prompt with Recommendations
  const prompt = `
I am analyzing a codebase for a project named "${projectName}". Below is the directory structure followed by the files and their contents.

### Directory Structure:
\`\`\`
${directoryTree.trim()}
\`\`\`

### Codebase Analysis:

For each file:
1. Provide a brief explanation of what the file does.
2. Explain how it fits within the overall program.
3. Identify any other files it interacts with or depends on.
4. Provide recommendations for improvements or best practices.

Please format the response as follows for each file:

### [Relative/File Path]

**Purpose:**
[Explanation of the file's purpose]

**Role in the Project:**
[Description of how it fits into the project]

**Dependencies and Interactions:**
[List of other files it interacts with or depends on]

**Recommendations:**
[Suggestions for improvements or best practices]

---
Here are the files and their contents:

${Object.entries(fileData).map(([file, content]) => `#### ${file}\n\`\`\`${path.extname(file).substring(1) || 'plaintext'}\n${content}\n\`\`\``).join('\n\n')}
`;

  console.log('Sending data to OpenRouter for analysis. This may take some time depending on the size of the codebase...');

  // Send prompt to OpenRouter
  const analysis = await sendToOpenRouter(prompt);

  if (analysis) {
    try {
      fs.writeFileSync(outputPath, analysis, 'utf8');
      console.log(`Success: Analysis has been saved to ${outputFileName}`);
    } catch (err) {
      console.error('Error: Failed to write analysis to file.', err);
    }
  } else {
    console.error('Error: No analysis was received from OpenRouter.');
  }

  console.log('=== Codebase Analysis Completed ===');
}

// Execute based on options
if (options.generate) {
  mainGenerate();
} else if (options.analyze) {
  mainAnalyze();
} else {
  console.log('No valid option selected. Use -g to generate directory or -a to analyze the codebase.');
  program.help(); // Display help if no option is selected
}
