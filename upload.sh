#!/bin/bash

# Default values
USERNAME=${1:-admin}
PASSWORD=${2:-password}
URL=${3:-http://localhost:3000/upload}

# Default base path is current directory
BASE_PATH=$(pwd)

# Function to clear screen and show header
show_header() {
  clear
  echo "===================================="
  echo "      Node App Upload Utility      "
  echo "===================================="
  echo ""
}

# Function to set base path
set_base_path() {
  show_header
  echo "Current base path: $BASE_PATH"
  echo ""
  read -p "Enter new base path (or press Enter to keep current): " new_path
  
  if [ -n "$new_path" ]; then
    if [ -d "$new_path" ]; then
      BASE_PATH="$new_path"
      echo "Base path updated to: $BASE_PATH"
    else
      echo "Error: Directory does not exist"
      read -p "Press Enter to continue..."
    fi
  fi
}

# Function to select and send a folder
select_folder() {
  show_header
  echo "Select a folder to send from: $BASE_PATH"
  echo ""
  
  # Get list of directories in base path
  dirs=($(find "$BASE_PATH" -maxdepth 1 -type d -not -path "$BASE_PATH" | sort))
  
  if [ ${#dirs[@]} -eq 0 ]; then
    echo "No folders found in $BASE_PATH"
    read -p "Press Enter to continue..."
    return
  fi
  
  # Display directories with numbers
  for i in "${!dirs[@]}"; do
    echo "$((i+1)). $(basename "${dirs[$i]}")"
  done
  
  echo ""
  read -p "Enter folder number (or 0 to cancel): " selection
  
  # Check if input is a number
  if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
    echo "Invalid selection"
    read -p "Press Enter to continue..."
    return
  fi
  
  # Check if selection is valid
  if [ "$selection" -eq 0 ]; then
    return
  elif [ "$selection" -gt 0 ] && [ "$selection" -le "${#dirs[@]}" ]; then
    selected_dir="${dirs[$((selection-1))]}"
    send_folder "$selected_dir"
  else
    echo "Invalid selection"
    read -p "Press Enter to continue..."
  fi
}

# Function to zip and send a folder
send_folder() {
  local folder="$1"
  local folder_name=$(basename "$folder")
  
  show_header
  echo "Preparing to send: $folder_name"
  echo ""
  
  # Change to parent directory of selected folder
  cd "$(dirname "$folder")"
  
  # Create zip file
  echo "Creating zip file..."
  zip -r app.zip "$folder_name" -x "*.git*"
  
  # Upload with progress bar
  echo "Uploading to $URL..."
  echo "This may take a while depending on the folder size..."
  echo ""
  curl -u "$USERNAME:$PASSWORD" -F "file=@app.zip" "$URL" --progress-bar
  echo ""
  
  # Clean up
  echo "Cleaning up..."
  rm app.zip
  
  echo ""
  echo "Upload complete!"
  read -p "Press Enter to continue..."
}

# Main menu loop
while true; do
  show_header
  echo "Current base path: $BASE_PATH"
  echo ""
  echo "1. Set base path"
  echo "2. Select folder to send"
  echo "3. Exit"
  echo ""
  read -p "Enter your choice: " choice
  
  case $choice in
    1) set_base_path ;;
    2) select_folder ;;
    3) exit 0 ;;
    *) echo "Invalid choice"; read -p "Press Enter to continue..." ;;
  esac
done