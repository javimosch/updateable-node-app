#!/bin/bash

# Check for debug flag
DEBUG_MODE=false
if [ "$1" == "--debug" ]; then
  DEBUG_MODE=true
  shift # Remove the --debug flag so other positional arguments work
fi

# Default values
USERNAME=${1:-admin}
PASSWORD=${2:-password}
URL=${3:-http://localhost:3888/upload}
BLACKLIST_FILE=".upload_blacklist"

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

# Function to set upload URL
set_upload_url() {
  show_header
  echo "Current upload URL: $URL"
  echo ""
  read -p "Enter new upload URL (or press Enter to keep current): " new_url
  
  if [ -n "$new_url" ]; then
    URL="$new_url"
    echo "Upload URL updated to: $URL"
  fi
  read -p "Press Enter to continue..."
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
  local folder_to_zip="$1"
  local folder_name=$(basename "$folder_to_zip")
  
  show_header
  echo "Preparing to send contents of: $folder_name"
  echo ""
  
  local temp_zip_file
  if [ "$DEBUG_MODE" = true ]; then
    # Place the debug zip in the base path so it can be found after the subshell returns
    temp_zip_file="$BASE_PATH/debug_upload.zip"
    echo "DEBUG MODE: Zip file will be saved as $temp_zip_file"
  else
    # Generate a unique temporary file in /tmp which will always be accessible
    temp_zip_file="$(mktemp /tmp/upload-XXXXXX.zip)"
  fi
  # Ensure the file does not exist before we start
  rm -f "$temp_zip_file"
  
  # The blacklist file is relative to the base path where the script is operating
  local blacklist_path="$BASE_PATH/$BLACKLIST_FILE"

  # Build the list of exclusion arguments for zip
  echo "Creating zip file..."
  local zip_args=()
  zip_args+=(-x "*.git*") # Always exclude git directories

  if [ -f "$blacklist_path" ]; then
    while IFS= read -r pattern; do
      # The patterns are now relative to the root of the zip
      if [ -n "$pattern" ]; then # ignore empty lines
        zip_args+=(-x "$pattern*")
      fi
    done < "$blacklist_path"
  fi
  
  # Use a subshell to `cd` into the directory and zip its contents
  # This prevents changing the working directory of the main script
  (
    set -x # Enable debug printing to see the exact command
    cd "$folder_to_zip" && zip -qr "$temp_zip_file" . "${zip_args[@]}"
    set +x # Disable debug printing
  )
  
  # Check if zip was created
  if [ ! -s "$temp_zip_file" ]; then
      echo "Error: Failed to create or zip file is empty."
      # The zip command might have printed an error already.
      rm -f "$temp_zip_file"
      read -p "Press Enter to continue..."
      return
  fi

  # Upload with progress bar
  echo "Uploading to $URL..."
  echo "This may take a while depending on the folder size..."
  echo ""
  curl -u "$USERNAME:$PASSWORD" -F "file=@$temp_zip_file" "$URL" --progress-bar
  echo ""
  
  # Clean up
  if [ "$DEBUG_MODE" = true ]; then
    echo "DEBUG MODE: Preserving $temp_zip_file"
  else
    echo "Cleaning up..."
    rm "$temp_zip_file"
  fi
  
  echo ""
  echo "Upload complete!"
  read -p "Press Enter to continue..."
}

# Function to manage blacklist
manage_blacklist() {
  while true; do
    show_header
    echo "Blacklist Management"
    echo ""
    
    # Show current blacklist
    if [ -f "$BLACKLIST_FILE" ] && [ -s "$BLACKLIST_FILE" ]; then
      echo "Current blacklisted folders:"
      cat "$BLACKLIST_FILE" | nl
    else
      echo "No folders currently blacklisted"
    fi
    
    echo ""
    echo "1. Add folder to blacklist"
    echo "2. Remove folder from blacklist"
    echo "3. Clear blacklist"
    echo "4. Back to main menu"
    echo ""
    read -p "Enter your choice: " choice
    
    case $choice in
      1)
        show_header
        echo "Add Folder to Blacklist"
        echo ""
        read -p "Enter folder name to blacklist (e.g. dist): " folder
        if [ -n "$folder" ]; then
          echo "$folder" >> "$BLACKLIST_FILE"
          echo "Added '$folder' to blacklist"
        else
          echo "No folder name entered"
        fi
        read -p "Press Enter to continue..."
        ;;
      2)
        show_header
        echo "Remove Folder from Blacklist"
        echo ""
        if [ -f "$BLACKLIST_FILE" ] && [ -s "$BLACKLIST_FILE" ]; then
          echo "Current blacklist:"
          cat "$BLACKLIST_FILE" | nl
          echo ""
          read -p "Enter line number to remove: " line_num
          if [[ "$line_num" =~ ^[0-9]+$ ]] && [ "$line_num" -le $(wc -l < "$BLACKLIST_FILE") ]; then
            sed -i "${line_num}d" "$BLACKLIST_FILE"
            echo "Removed line $line_num"
          else
            echo "Invalid line number"
          fi
        else
          echo "Blacklist is empty"
        fi
        read -p "Press Enter to continue..."
        ;;
      3)
        show_header
        echo "Clear Blacklist"
        echo ""
        if [ -f "$BLACKLIST_FILE" ]; then
          rm "$BLACKLIST_FILE"
          echo "Blacklist cleared"
        else
          echo "Blacklist is already empty"
        fi
        read -p "Press Enter to continue..."
        ;;
      4)
        return
        ;;
      *)
        echo "Invalid choice"
        read -p "Press Enter to continue..."
        ;;
    esac
  done
}

# Main menu loop
while true; do
  show_header
  echo "Current base path: $BASE_PATH"
  echo ""
  echo "1. Set base path"
  echo "2. Set upload URL"
  echo "3. Select folder to send"
  echo "4. Manage blacklist"
  echo "5. Exit"
  echo ""
  read -p "Enter your choice: " choice
  
  case $choice in
    1) set_base_path ;;
    2) set_upload_url ;;
    3) select_folder ;;
    4) manage_blacklist ;;
    5) exit 0 ;;
    *) echo "Invalid choice"; read -p "Press Enter to continue..." ;;
  esac
done
