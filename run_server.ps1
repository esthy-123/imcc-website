# PowerShell script to start the IMCC website server
# Set required environment variables
$env:HOST = "0.0.0.0"
$env:PORT = "3456"

# Install dependencies (run once or after changes)
Write-Host "Installing dependencies..."
npm ci

# Start the server
Write-Host "Starting server..."
npm start
