# tunaDish

A powerful, cross-platform AI agent coding assistant client, deeply integrated with the `tunapi` ecosystem.

## Features
- **Project Context Awareness**: Connects easily to your pre-initialized `tunapi` software projects.
- **WebSocket-based Realtime UI**: Employs an asynchronous python transport bridge `tunadish_transport` for blazing-fast event streaming (message, progress, UI state tracking).
- **Three-Panel Productivity Layout**: Sidebar for project selection, Central Chat interface with Markdown renderer, and contextual tools panel.
- **Cross-Platform Readiness**: Built with Tauri + React, delivering seamless desktop compatibility (Linux/Windows/macOS) with optimized UI performance under Webkit2GTK / Xwayland.

## Prerequisites
- Node.js & npm
- Python 3.12+ (managed via your system or pipenv/venv)
- `tunapi` backend core installation

## Local Development Setup

### 1. Setup Python Transport (Backend)
```bash
# Clone the repository
git clone https://github.com/hang-in/tunaDish.git
cd tunaDish

# Set up Python virtual environment
python -m venv .venv
source .venv/bin/activate

# Install the tunadish backend transport plug-in
pip install -e transport/
```

### 2. Run the WebSocket Daemon
Start the backend WebSocket server which will respond to the React App:
```bash
# Ensure you are activated into the python .venv
tunapi claude --transport tunadish
```

### 3. Run the Desktop Client
In a separate terminal, install Node dependencies and launch the Tauri Desktop dev server:
```bash
cd client
npm install

# Start the application! (Includes stability fixes for certain Wayland Linux desktops)
npm run tauri dev
```

## Tech Stack
- **Frontend**: React, TypeScript, Tailwind CSS, Zustand, tauri-apps/api
- **Backend / Core Engine**: Python, AnyIO, WebSockets, `tunapi` Agent CLI

## License
MIT (or your preferred license).
