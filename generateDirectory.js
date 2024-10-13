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
  .name('generateDirectory')
  .description('Generate directory tree and analyze codebase.')
  .version('1.0.0');

// Generate Directory Command
program
  .command('generate')
  .description('Generate a text-based directory tree of the current project.')
  .action(() => {
    mainGenerate();
  });

// Analyze Codebase Command
program
  .command('analyze')
  .description('Analyze the codebase by sending file contents to OpenRouter.')
  .action(() => {
    mainAnalyze();
  });

// Parse CLI arguments
program.parse(process.argv);

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
      }
    } catch (error) {
      console.warn('Could not parse package.json to get project name.');
    }
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
    console.error(`Error reading directory: ${dirPath}`, err);
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
  const projectPath = process.cwd();
  const projectName = getProjectName(projectPath);
  const dateTime = getFormattedDateTime();
  const outputFileName = `${projectName}_directory_${dateTime}.txt`;
  const outputPath = path.join(projectPath, outputFileName);

  const directoryTree = buildDirectoryTree(projectPath);

  try {
    fs.writeFileSync(outputPath, directoryTree, 'utf8');
    console.log(`Directory tree has been saved to ${outputFileName}`);
  } catch (err) {
    console.error('Error writing directory tree to file:', err);
  }
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
      console.warn(`Skipping ${filePath} as it exceeds the size limit of ${maxSize} bytes.`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (err) {
    console.error(`Error reading file: ${filePath}`, err);
    return null;
  }
}

// Function to send data to OpenRouter API
async function sendToOpenRouter(prompt) {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'google/gemini-pro-1.5-exp', // Using the specified model
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
      console.warn('No response from OpenRouter API.');
      return '';
    }
  } catch (error) {
    console.error('Error communicating with OpenRouter API:', error.response ? error.response.data : error.message);
    return '';
  }
}

// Function to analyze codebase
async function mainAnalyze() {
  const projectPath = process.cwd();
  const projectName = getProjectName(projectPath);
  const dateTime = getFormattedDateTime();
  const outputFileName = `${projectName}_analysis_${dateTime}.txt`;
  const outputPath = path.join(projectPath, outputFileName);

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
    }
  }

  // Prepare prompt
  const prompt = `
I am analyzing a codebase for a project named "${projectName}". Below are the files along with their contents.

For each file:
1. Provide a brief explanation of what the file does.
2. Explain how it fits within the overall program.
3. Identify any other files it interacts with or depends on.

Please format the response as follows for each file:

### [Relative/File Path]

**Purpose:**
[Explanation of the file's purpose]

**Role in the Project:**
[Description of how it fits into the project]

**Dependencies and Interactions:**
[List of other files it interacts with or depends on]

---

Here are the files and their contents:

${Object.entries(fileData).map(([file, content]) => `#### ${file}\n\`\`\`${path.extname(file).substring(1)}\n${content}\n\`\`\``).join('\n\n')}
`;

  console.log('Sending data to OpenRouter for analysis... This may take a while depending on the size of the codebase.');

  // Send prompt to OpenRouter
  const analysis = await sendToOpenRouter(prompt);

  if (analysis) {
    try {
      fs.writeFileSync(outputPath, analysis, 'utf8');
      console.log(`Analysis has been saved to ${outputFileName}`);
    } catch (err) {
      console.error('Error writing analysis to file:', err);
    }
  } else {
    console.error('No analysis was received from OpenRouter.');
  }
}
