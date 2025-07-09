#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Pentest Copilot Setup Script${NC}"
    echo -e "${BLUE}================================${NC}"
    echo
}

print_section() {
    echo -e "${CYAN}--- $1 ---${NC}"
}

# Function to check if running on WSL
check_wsl() {
    if grep -qi microsoft /proc/version 2>/dev/null; then
        return 0  # True - running on WSL
    else
        return 1  # False - not running on WSL
    fi
}

# Function to validate API key format (basic check)
validate_api_key() {
    local api_key="$1"
    if [[ -z "$api_key" ]]; then
        return 0  # Empty is valid (optional)
    fi
    return 0  # Empty is valid (optional)
}

# Helper function to set or replace an environment variable in a .env file
set_env_var() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"
    # Remove any existing line for this variable
    grep -v "^$var_name=" "$env_file" > "$env_file.tmp" && mv "$env_file.tmp" "$env_file"
    # Append the new value
    echo "$var_name=$var_value" >> "$env_file"
}

# Function to prompt for API key
prompt_api_key() {
    local key_name="$1"
    local env_var="$2"
    local description="$3"
    
    echo
    print_section "OpenAI API Key Setup"
    echo -e "${YELLOW}$description${NC}"
    echo -e "${YELLOW}This is optional but required for AI features to work.${NC}"
    echo -e "${YELLOW}You can skip this and add it later to the .env file.${NC}"
    echo
    echo -e "${CYAN}Enter your OpenAI API key for $key_name (or press Enter to skip):${NC} "
    read -r api_key
    
    if [[ -n "$api_key" ]]; then
        if validate_api_key "$api_key"; then
            set_env_var "$env_file" "$env_var" "$api_key"
            print_status "API key for $key_name added successfully!"
        else
            print_warning "Invalid API key format. Skipping $key_name setup."
            print_warning "You can add it manually later to $env_file"
        fi
    else
        print_status "Skipping $key_name API key setup"
    fi
}

# Function to prompt for SSH configuration
prompt_ssh_config() {
    local env_file="$1"
    
    echo
    print_section "SSH Configuration (Optional)"
    echo -e "${YELLOW}Configure SSH settings for exploit box features.${NC}"
    echo -e "${YELLOW}This is optional and can be configured later.${NC}"
    echo
    echo -e "${CYAN}Do you want to configure SSH settings now? (y/n):${NC} "
    read -r configure_ssh
    
    if [[ "$configure_ssh" =~ ^[Yy]$ ]]; then
        echo
        echo -e "${CYAN}SSH Host (default: localhost):${NC} "
        read -r ssh_host
        ssh_host=${ssh_host:-localhost}
        
        echo -e "${CYAN}SSH Port (default: 4242):${NC} "
        read -r ssh_port
        ssh_port=${ssh_port:-4242}
        
        echo -e "${CYAN}SSH Username (default: root):${NC} "
        read -r ssh_username
        ssh_username=${ssh_username:-root}
        
        echo
        echo -e "${CYAN}Authentication method:${NC}"
        echo "1. Password authentication"
        echo "2. Private key authentication"
        echo -e "${CYAN}Choose (1 or 2, or press Enter to skip):${NC} "
        read -r auth_method
        
        case $auth_method in
            1)
                echo -e "${CYAN}SSH Password:${NC} "
                read -s ssh_password
                echo
                if [[ -n "$ssh_password" ]]; then
                    set_env_var "$env_file" "SSH_HOST" "$ssh_host"
                    set_env_var "$env_file" "SSH_PORT" "$ssh_port"
                    set_env_var "$env_file" "SSH_USERNAME" "$ssh_username"
                    set_env_var "$env_file" "SSH_PASSWORD" "$ssh_password"
                    set_env_var "$env_file" "SSH_PRIVATE_KEY" ""
                    set_env_var "$env_file" "SSH_PRIVATE_KEY_PASSPHRASE" ""
                    print_status "SSH password authentication configured!"
                fi
                ;;
            2)
                echo -e "${CYAN}Path to private key file:${NC} "
                read -r private_key_path
                if [[ -n "$private_key_path" && -f "$private_key_path" ]]; then
                    echo -e "${CYAN}Private key passphrase (if any, or press Enter):${NC} "
                    read -s ssh_passphrase
                    echo
                    set_env_var "$env_file" "SSH_HOST" "$ssh_host"
                    set_env_var "$env_file" "SSH_PORT" "$ssh_port"
                    set_env_var "$env_file" "SSH_USERNAME" "$ssh_username"
                    set_env_var "$env_file" "SSH_PASSWORD" ""
                    set_env_var "$env_file" "SSH_PRIVATE_KEY" "$private_key_path"
                    set_env_var "$env_file" "SSH_PRIVATE_KEY_PASSPHRASE" "$ssh_passphrase"
                    print_status "SSH private key authentication configured!"
                else
                    print_warning "Invalid private key path. Skipping SSH configuration."
                fi
                ;;
            *)
                print_status "Skipping SSH configuration"
                ;;
        esac
    else
        print_status "Skipping SSH configuration"
    fi
}

# Function to create .env file from template
create_env_file() {
    local template_file="$1"
    local env_file="$2"
    local is_wsl="$3"
    
    if [ ! -f "$template_file" ]; then
        print_error "Template file not found: $template_file"
        return 1
    fi
    
    # Copy template to .env file
    cp "$template_file" "$env_file"
    
    if [ "$is_wsl" = "true" ]; then
        print_status "Replacing 127.0.0.1 with localhost for WSL compatibility..."
        sed -i 's/127\.0\.0\.1/localhost/g' "$env_file"
    fi
    
    print_status "Created $env_file"
    return 0
}

# Function to configure backend environment
configure_backend_env() {
    local env_file="backend/.env"
    
    print_section "Backend Configuration"
    
    # Prompt for large model API key
    prompt_api_key "Large Model (GPT-4)" "MODEL_API_KEY_LARGE" "Used for complex reasoning and analysis tasks"
    
    # Prompt for small model API key
    prompt_api_key "Small Model (GPT-3.5)" "MODEL_API_KEY_SMALL" "Used for summarization and quick tasks"
    
    # Prompt for SSH configuration
    prompt_ssh_config "$env_file"
    
    print_status "Backend configuration completed!"
}

# Function to configure frontend environment
configure_frontend_env() {
    local env_file="frontend/.env"
    
    print_section "Frontend Configuration"
    
    echo -e "${YELLOW}Frontend configuration is minimal.${NC}"
    echo -e "${YELLOW}The basic settings have been copied from the template.${NC}"
    
    # Optional: Google Tag Manager
    echo
    echo -e "${CYAN}Do you want to configure Google Tag Manager? (y/n):${NC} "
    read -r configure_gtm
    
    if [[ "$configure_gtm" =~ ^[Yy]$ ]]; then
        echo -e "${CYAN}Enter your Google Tag Manager ID (GTM-XXXXXXX):${NC} "
        read -r gtm_id
        if [[ -n "$gtm_id" ]]; then
            set_env_var "$env_file" "NEXT_PUBLIC_GTM_ID" "$gtm_id"
            print_status "Google Tag Manager ID configured!"
        fi
    else
        print_status "Skipping Google Tag Manager configuration"
    fi
    
    print_status "Frontend configuration completed!"
}

# Main setup function
main() {
    print_header
    
    # Check if we're running on WSL
    is_wsl=false
    if check_wsl; then
        print_warning "WSL detected!"
        echo -e "${YELLOW}Are you running this on WSL? (y/n):${NC} "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            is_wsl=true
            print_status "WSL mode enabled - will replace 127.0.0.1 with localhost"
        else
            print_status "WSL mode disabled - keeping 127.0.0.1"
        fi
    else
        print_status "Not running on WSL - keeping 127.0.0.1"
    fi
    
    echo
    
    # Create backend .env file
    print_status "Setting up backend environment..."
    if create_env_file "backend/.env.template" "backend/.env" "$is_wsl"; then
        print_status "Backend .env file created successfully!"
        configure_backend_env
    else
        print_error "Failed to create backend .env file"
        exit 1
    fi
    
    echo
    
    # Create frontend .env file
    print_status "Setting up frontend environment..."
    if create_env_file "frontend/.env.template" "frontend/.env" "$is_wsl"; then
        print_status "Frontend .env file created successfully!"
        configure_frontend_env
    else
        print_error "Failed to create frontend .env file"
        exit 1
    fi
    
    echo
    
    # Final instructions
    print_status "Setup completed successfully!"
    echo
    echo -e "${YELLOW}Summary:${NC}"
    echo "✓ Backend .env file created"
    echo "✓ Frontend .env file created"
    if [ "$is_wsl" = "true" ]; then
        echo "✓ WSL compatibility applied (127.0.0.1 → localhost)"
    fi
    echo
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Review and edit the .env files if needed:"
    echo "   - backend/.env"
    echo "   - frontend/.env"
    echo
    echo "2. Make sure your MongoDB is running (default: localhost:27017)"
    echo "3. Start the application with docker-compose or npm scripts"
    echo
    echo -e "${YELLOW}Important:${NC} If you skipped API key setup, add them to backend/.env before using AI features!"
    echo
}

# Run the main function
main "$@"
