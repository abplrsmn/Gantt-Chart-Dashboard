# Read Excel and PDF Files

## Purpose
A workflow for accurately extracting, parsing, and reading data from Excel (.xlsx, .xls) and PDF (.pdf) files in the workspace.

## Context
Excel and PDF files cannot be accurately parsed using standard text-reading tools. They require specialized libraries or scripts to extract content into a readable format (like CSV, JSON, or Markdown).

## Workflow

### 1. Identify File Type
- **Excel (.xlsx, .csv):** Use Python (`pandas` or `openpyxl`) to read sheets and convert them into an intermediate format (like JSON or CSV) for analysis.
- **PDF (.pdf):** Use Python (`pdfplumber` for tabular data or `PyPDF2` / `pdfminer` for plain text) to extract the text.

### 2. Setup Environment
Before processing:
1. Ensure the required Python packages are installed (e.g., `pandas`, `openpyxl`, `pdfplumber`).
2. Use the `run_in_terminal` or `execute_python_code` (if available) to run extraction scripts.

### 3. Extraction Strategy
- **For Excel:** 
  - List all sheet names first.
  - Read specific sheets and rows to avoid overwhelming context length.
  - Export relevant data to a temporary CSV or JSON file, then read that file.
- **For PDF:**
  - Extract text page by page.
  - If looking for tabular data in PDF, specifically use tools that extract tables (e.g., `pdfplumber`).
  - Output extracted text into a temporary Markdown or text file for analysis.

### 4. Analyze and Clean
- Read the intermediate dumped files (`read_file`).
- Answer the user's query based on the extracted text/data.
- Clean up intermediate files if no longer needed.

## Example Usage
- "Analyze the financial data in `report.xlsx`."
- "Extract the contract terms from `agreement.pdf`."
