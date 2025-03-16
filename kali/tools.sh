#!/bin/bash

# Ensure necessary dependencies are installed
apt update -y && apt install -y git golang wget unzip tar python3-pip

# List of tools to install
TOOLS=(
    "ffuf"
    "feroxbuster"
    "dirsearch"
    "wfuzz"
    "gobuster"
    "subfinder"
    "amass"
    "findomain"
    "assetfinder"
    "shuffledns"
    "puredns"
    "dnsx"
    "hydra"
    "patator"
    "crowbar"
    "wpscan"
    "drupwn"
    "cmsmap"
    "nmap"
    "naabu"
    "smap"
    "masscan"
    "waybackurls"
    "gau"
    "xnLinkFinder"
    "waymore"
    "katana"
    "gospider"
    "whatsweb"
    "ttpx"
    "sqlmap"
    "ghauri"
    "graphqlmap"
    "dalfox"
    "secretfinder"
    "httpx"
    "nuclei"
    "airixss"
    "qsreplace"
    "cloud_enum"
    "S3Scanner"
    "apkleaks"
)

# List to store failed installations
FAILED_INSTALLS=()

# Function to check installation success
check_installation() {
    if ! command -v "$1" &> /dev/null; then
        FAILED_INSTALLS+=("$1")
    fi
}

# Install tools using apt, pip, and go where necessary
for TOOL in "${TOOLS[@]}"; do
    echo "Installing: $TOOL"
    case "$TOOL" in
        "nmap") apt install -y nmap;;
        # "feroxbuster") apt install -y feroxbuster;;
        # "ffuf"|"gau"|"waybackurls"|"airixss"|"qsreplace") go install github.com/tomnomnom/$TOOL@latest;;
        # # "dirsearch") git clone https://github.com/maurosoria/dirsearch.git && cd dirsearch && pip3 install -r requirements.txt && cd ..;;
        # "wfuzz"|"gobuster"|"nmap"|"masscan"|"hydra"|"patator") apt install -y $TOOL;;
        # "subfinder"|"naabu"|"dnsx"|"httpx"|"nuclei"|"katana") go install -v github.com/projectdiscovery/$TOOL/cmd/$TOOL@latest;;
        # "assetfinder") go install github.com/tomnomnom/assetfinder@latest;;
        # "findomain") wget https://github.com/Edu4rdSHL/findomain/releases/latest/download/findomain-linux -O /usr/local/bin/findomain && chmod +x /usr/local/bin/findomain;;
        # "gospider") go install github.com/jaeles-project/gospider@latest;;
        # # "waymore"|"whatsweb"|"xnLinkFinder") git clone https://github.com/xnl-h4ck3r/$TOOL.git && cd $TOOL && pip3 install -r requirements.txt && cd ..;;
        # # "cloud_enum"|"S3Scanner"|"apkleaks") git clone https://github.com/initstring/$TOOL.git && cd $TOOL && pip3 install -r requirements.txt && cd ..;;
        # # "drupwn"|"cmsmap") git clone https://github.com/immunIT/$TOOL.git && cd $TOOL && pip3 install -r requirements.txt && cd ..;;
        # "sqlmap"|"wpscan") apt install -y $TOOL;;
        # # "ghauri"|"graphqlmap"|"dalfox"|"secretfinder") git clone https://github.com/r0oth3x49/$TOOL.git && cd $TOOL && pip3 install -r requirements.txt && cd ..;;
        *) echo "Skipping unknown tool: $TOOL";;
    esac
    check_installation "$TOOL"
done

# Display unsuccessful installations
if [ ${#FAILED_INSTALLS[@]} -ne 0 ]; then
    echo "\nThe following tools failed to install:" 
    for FAIL in "${FAILED_INSTALLS[@]}"; do
        echo "- $FAIL"
    done
else
    echo "\nAll tools installed successfully."
fi