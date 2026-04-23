# ReportHelper (SSRS Management & SQL Testing Tool)

**ReportHelper** is a powerful, modern desktop application designed specifically for developers and administrators working with **Microsoft SQL Server Reporting Services (SSRS)**. 

The application simplifies the process of managing, testing, and developing RDL reports through a unified, fast, and extremely secure interface.

![App Screenshot](https://raw.githubusercontent.com/tauri-apps/tauri/dev/app-icon.png) <!-- Replace with actual screenshot later -->

## ✨ Key Features

### 1. Report Management (Explorer)
- Browse RDL files directly from local disks or from an SSRS Server.
- Full support for file operations: Add, Delete, Rename, and Move.
- Fast search and navigation within the report tree.

### 2. Report Analysis (Overview)
- Quickly view RDL file metadata and structure.
- List all **DataSources**, **DataSets**, and **Parameters** defined within the report.

### 3. SQL Testing (SQL Tester)
- Extract SQL queries directly from report datasets.
- Smart parameter input interface with support for dynamic values.
- **Safe Run Mode**: Automatically wraps queries in `BEGIN TRANSACTION ... ROLLBACK` for absolute data safety during testing.

### 4. Professional SQL Editor
- Integrated **Monaco Editor** (VS Code engine) with IntelliSense/autocomplete.
- Manage multiple database connections seamlessly.
- View query results in a clean, professional grid.

### 5. SSRS Server Integration
- Upload and Download reports from the server.
- Export reports to multiple formats: PDF, Excel, Word, CSV, etc.
- Quickly open reports in the system web browser.

## 🛠 Tech Stack

- **Frontend**: React.js, TypeScript, Vite.
- **UI Components**: Vanilla CSS (Premium Custom Design), Codicons.
- **Backend**: Rust (Tauri v2).
- **Database Logic**: Tiberius (SQL Server Driver for Rust).
- **Editor Engine**: Monaco Editor.

## 🚀 Getting Started

### System Requirements
- Node.js (Latest version).
- Rust Toolchain.
- WebView2 (For Windows users).

### Development Setup
1. Clone the repo: `git clone <your-repo-url>`
2. Install dependencies: `npm install`
3. Run in dev mode: `npm run tauri dev`

## 📦 Building & Distribution

The project is pre-configured with **GitHub Actions** for automated builds for Windows and macOS. Simply push a new tag to GitHub:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 📄 License
This project is released under the **MIT License**. You are free to use, modify, and distribute it.

Copyright (c) 2024 @thuantd.
