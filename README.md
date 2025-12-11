# ShiftCycle 18 - Work Hour Balancer

ShiftCycle 18 is a smart working hours calculator designed for 18-day shift cycles. It helps staff track regular shifts, handle irregularities like training courses or team transfers, and maintain a running balance of work hours.

## Features

- **Shift Tracking**: Easily mark days as Regular Shift, Off Day, Leave (V/L, Holiday), or Custom hours.
- **Smart Calculations**: Automatically calculates surplus or deficit hours based on a 123.6h target per 18-day cycle.
- **Cycle Navigation**: Navigate through past and future cycles with automatic balance carry-over.
- **Situation Wizard**: Quickly handle complex scenarios like multi-day training courses or team redeployments (transfers).
- **Time Calculator**: Built-in tool to convert Start/End times into decimal hours, accounting for breaks.
- **Local Analysis**: Generate formal status statements and reports instantly on-device.
- **Data Persistence**: Auto-saves to local storage with Backup/Restore functionality (JSON export/import).
- **Responsive Design**: Optimized for mobile usage with a clean, touch-friendly UI.

## Tech Stack

- **React 19**: Frontend framework.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Lucide React**: Icon library.
- **React Markdown**: For rendering generated reports.

## Setup

This project is currently set up to run in an environment supporting ES Modules and Import Maps (like certain online sandboxes or direct browser usage with a server).

To run locally, you can serve the files using a static server (e.g., `serve` or `http-server`) or port the components into a standard Vite/Create-React-App structure.

## Usage

1. **Set Anchor Date**: On first launch, set a "Cycle Start Date" (the first day of any previous 18-day cycle) and your Staff Number.
2. **Log Days**: Tap dates to assign statuses or use the "Quick Assign" paint bucket tool for batch editing.
3. **Check Stats**: The bottom panel shows your current target, hours worked, and net balance.
4. **Generate Report**: Click "Analyze Report" to generate a formal text summary suitable for timesheets or email.
