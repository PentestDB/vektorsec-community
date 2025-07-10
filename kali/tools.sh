#!/usr/bin/env bash
set -e

# 1) ensure env for Go tools
export GOPATH="/root/go"
export PATH="$PATH:$GOPATH/bin:/usr/local/bin"

# 2) update & install system packages
apt-get update -y
apt-get install -y --no-install-recommends \
    git golang wget unzip tar python3-pip build-essential \
    libpcap-dev \
    ffuf wfuzz gobuster hydra patator crowbar nmap masscan \
    amass whatweb wpscan sqlmap \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# 3) go-install ProjectDiscovery & other Go tools
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest
go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest
go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
go install github.com/projectdiscovery/httpx/cmd/httpx@latest
go install github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
go install github.com/tomnomnom/qsreplace@latest
go install github.com/tomnomnom/waybackurls@latest
go install github.com/lc/gau@latest
go install github.com/hahwul/dalfox@latest
go install github.com/ffuf/ffuf/v2@latest
go install github.com/epi052/feroxbuster@latest
go install github.com/jaeles-project/gospider@latest
go install github.com/tomnomnom/assetfinder@latest
go install github.com/d3mondev/puredns/v2@latest

# 4) install Python-based tools via pip or Git
pip3 install --no-cache-dir drupwn cmsmap apkleaks

git clone https://github.com/maurosoria/dirsearch.git /opt/dirsearch \
 && pip3 install --no-cache-dir -r /opt/dirsearch/requirements.txt \
 && ln -s /opt/dirsearch/dirsearch.py /usr/local/bin/dirsearch

git clone https://github.com/xnl-h4ck3r/xnLinkFinder.git /opt/xnLinkFinder \
 && pip3 install --no-cache-dir -r /opt/xnLinkFinder/requirements.txt \
 && ln -s /opt/xnLinkFinder/xnLinkFinder.py /usr/local/bin/xnLinkFinder

git clone https://github.com/xnl-h4ck3r/waymore.git /opt/waymore \
 && pip3 install --no-cache-dir -r /opt/waymore/requirements.txt \
 && ln -s /opt/waymore/waymore.py /usr/local/bin/waymore

git clone https://github.com/r0oth3x49/ghauri.git /opt/ghauri \
 && pip3 install --no-cache-dir -r /opt/ghauri/requirements.txt \
 && ln -s /opt/ghauri/ghauri.py /usr/local/bin/ghauri

git clone https://github.com/swisskyrepo/GraphQLmap.git /opt/graphqlmap \
 && pip3 install --no-cache-dir -r /opt/graphqlmap/requirements.txt \
 && ln -s /opt/graphqlmap/graphqlmap.py /usr/local/bin/graphqlmap

git clone https://github.com/m4ll0k/SecretFinder.git /opt/SecretFinder \
 && pip3 install --no-cache-dir -r /opt/SecretFinder/requirements.txt \
 && ln -s /opt/SecretFinder/SecretFinder.py /usr/local/bin/secretfinder

# 5) make sure go bins are in /usr/local/bin
for bin in $(ls $GOPATH/bin); do
  ln -sf "$GOPATH/bin/$bin" /usr/local/bin/$bin
done

echo
echo "🎉 All tools installed. They're now available in any shell:"
echo "   e.g. run: ffuf, subfinder, dirsearch, sqlmap, nuclei, etc."
echo
echo "If you ever add more go-based tools, just:"
echo "  export GOPATH=/root/go; go install <>@latest"
