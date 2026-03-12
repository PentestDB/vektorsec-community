#!/usr/bin/env bash
set -e

export GOPATH="/root/go"
export PATH="$PATH:$GOPATH/bin:/usr/local/bin"

apt-get update -y
apt-get install -y --no-install-recommends \
    git golang wget unzip tar python3-pip python3-venv pipx build-essential \
    libpcap-dev \
    ffuf wfuzz gobuster hydra patator crowbar nmap masscan \
    amass whatweb wpscan sqlmap feroxbuster \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# ── Go tools ──
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest
go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest
go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
go install github.com/projectdiscovery/httpx/cmd/httpx@latest
go install github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install github.com/tomnomnom/qsreplace@latest
go install github.com/tomnomnom/waybackurls@latest
go install github.com/lc/gau/v2/cmd/gau@latest
go install github.com/hahwul/dalfox/v2@latest
go install github.com/ffuf/ffuf/v2@latest
go install github.com/jaeles-project/gospider@latest
go install github.com/tomnomnom/assetfinder@latest
go install github.com/d3mondev/puredns/v2@latest

for bin in "$GOPATH"/bin/*; do
  ln -sf "$bin" /usr/local/bin/"$(basename "$bin")"
done

# ── Python tools (PEP 668-safe: use venvs instead of bare pip) ──

install_pip_tool() {
    local name="$1" repo="$2" entry="$3"
    git clone --depth 1 "$repo" "/opt/$name"
    python3 -m venv "/opt/$name/venv"
    if [ -f "/opt/$name/requirements.txt" ]; then
        "/opt/$name/venv/bin/pip" install --no-cache-dir -r "/opt/$name/requirements.txt"
    fi
    if [ -n "$entry" ] && [ -f "/opt/$name/$entry" ]; then
        cat > "/usr/local/bin/$name" <<WRAPPER
#!/bin/sh
exec /opt/$name/venv/bin/python /opt/$name/$entry "\$@"
WRAPPER
        chmod +x "/usr/local/bin/$name"
    fi
}

install_pipx_tool() {
    PIPX_HOME=/opt/pipx PIPX_BIN_DIR=/usr/local/bin pipx install "$1" 2>/dev/null || \
        echo "Warning: could not install $1 via pipx"
}

install_pipx_tool drupwn
install_pipx_tool cmsmap
install_pipx_tool apkleaks

install_pip_tool dirsearch  https://github.com/maurosoria/dirsearch.git   dirsearch.py
install_pip_tool xnLinkFinder https://github.com/xnl-h4ck3r/xnLinkFinder.git xnLinkFinder.py
install_pip_tool waymore     https://github.com/xnl-h4ck3r/waymore.git     waymore.py
install_pip_tool ghauri      https://github.com/r0oth3x49/ghauri.git       ghauri
install_pip_tool graphqlmap  https://github.com/swisskyrepo/GraphQLmap.git  graphqlmap.py
install_pip_tool SecretFinder https://github.com/m4ll0k/SecretFinder.git   SecretFinder.py

echo
echo "All tools installed. Available in any shell:"
echo "  e.g. ffuf, subfinder, dirsearch, sqlmap, nuclei, etc."
echo
