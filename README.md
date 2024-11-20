# Code Summary Tool - Beginner's Guide

This README will guide you through setting up and running a Node.js script that generates a directory tree or analyzes the codebase of your project using the OpenRouter API.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Setup](#setup)
4. [Usage](#usage)
   - [Generate Directory Tree](#generate-directory-tree)
   - [Analyze Codebase](#analyze-codebase)
5. [Troubleshooting](#troubleshooting)
6. [Additional Information](#additional-information)

## Prerequisites

Before running this project, ensure that you have the following installed:

- **Node.js**: [Download Node.js](https://nodejs.org/)
- **VS Code** (for Windows and Mac): [Download VS Code](https://code.visualstudio.com/)
- Alternatively, **Xcode** for Mac users if preferred: [Download Xcode](https://developer.apple.com/xcode/)

## Installation

1. Clone or download the code file.
2. Open the project folder in your preferred editor (VS Code or Xcode).

### For VS Code:

1. Open VS Code and go to the `File > Open Folder` menu to select your project directory.
2. Open a terminal within VS Code by selecting `Terminal > New Terminal`.

### For Xcode (Mac users):

1. Open Xcode and select `File > Open` to navigate to the project folder.
2. Use the terminal within Xcode, or you can use your macOS terminal.

### Install dependencies

In your terminal, run the following command to install the required packages:

```bash
npm install
```

## Setup

This script interacts with the OpenRouter API, and to run it successfully, you need to configure some environment variables.

1. Create a `.env` file in the root directory of your project.
2. Add the following keys to the `.env` file and replace `YOUR_API_KEY` with the actual API key.

```
OPENROUTER_API_KEY=YOUR_API_KEY
YOUR_SITE_URL=your-site-url (optional)
YOUR_SITE_NAME=your-site-name (optional)
```

The `OPENROUTER_API_KEY` is required for the analysis feature. If this is not configured correctly, the script will exit with an error.

## Usage

You can run the script in two modes:
1. Generate a directory tree.
2. Analyze the codebase and send it to the OpenRouter API.

### Generate Directory Tree

To generate a text-based directory structure of your project:

1. Open the terminal in your project directory.
2. Run the following command:

```bash
node codeSummary.js --generate
```

This will create a `.txt` file in your project folder containing the directory tree.

### Analyze Codebase

To analyze the codebase and send the results to the OpenRouter API:

1. Ensure you have set your `OPENROUTER_API_KEY` in the `.env` file.
2. Run the following command:

```bash
node codeSummary.js
```

This will analyze your codebase by sending file contents to the OpenRouter API. A detailed report will be generated and saved as a `.txt` file in your project folder.

## Troubleshooting

- **Error: OPENROUTER_API_KEY is not set in the .env file.**
  - Make sure you have created a `.env` file in the root directory of the project and added the `OPENROUTER_API_KEY` variable with a valid API key.
- **Wrong file type**
   - You might need to change the extension of the codesummary file to `.mjs` or `.cjs` depending on your environment.

- **Command Not Found**
  - Ensure that `node` is installed correctly. You can verify this by running `node -v` in the terminal. If Node.js is not installed, download and install it from [here](https://nodejs.org/).

## Additional Information

This script helps you analyze your project by generating a structured directory tree or sending the codebase for analysis to an API. It can be extended or modified to support other features as well.

For more information on the OpenRouter API, visit the official [OpenRouter Documentation](https://openrouter.ai/docs).

