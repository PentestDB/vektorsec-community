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

# ── Cloud tooling (Cloud Village / cloud CTFs) ──

# Provider CLIs
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
  && unzip -qo /tmp/awscliv2.zip -d /tmp && /tmp/aws/install --update && rm -rf /tmp/aws /tmp/awscliv2.zip

curl -fsSL "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz" -o /tmp/gcloud.tgz \
  && tar -xzf /tmp/gcloud.tgz -C /opt && rm /tmp/gcloud.tgz \
  && /opt/google-cloud-sdk/install.sh -q --usage-reporting false --path-update false \
  && ln -sf /opt/google-cloud-sdk/bin/gcloud /opt/google-cloud-sdk/bin/gsutil /opt/google-cloud-sdk/bin/bq /usr/local/bin/

curl -fsSL https://aka.ms/InstallAzureCLIDeb | bash || echo "Warning: azure-cli install failed"

curl -fsSL "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
  -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl

# GitHub release binaries — resolve the real asset URL rather than guessing the filename.
gh_release_dl() {
    local repo="$1" pattern="$2" out="$3"
    local url
    url="$(curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" \
           | grep -o "https://[^\"]*${pattern}" | head -1)"
    if [ -z "$url" ]; then echo "Warning: no asset matching ${pattern} in ${repo}"; return 1; fi
    curl -fsSL "$url" -o "$out"
}

gh_release_dl digitalocean/doctl 'doctl-[0-9.]*-linux-amd64\.tar\.gz' /tmp/doctl.tgz \
  && tar -xzf /tmp/doctl.tgz -C /usr/local/bin doctl
gh_release_dl aliyun/aliyun-cli 'aliyun-cli-linux-[0-9.]*-amd64\.tgz' /tmp/aliyun.tgz \
  && tar -xzf /tmp/aliyun.tgz -C /usr/local/bin aliyun
gh_release_dl BishopFox/cloudfox 'cloudfox-linux-amd64\.zip' /tmp/cf.zip \
  && unzip -qo /tmp/cf.zip -d /tmp/cf \
  && install -m755 "$(find /tmp/cf -name cloudfox -type f | head -1)" /usr/local/bin/cloudfox
gh_release_dl trufflesecurity/trufflehog 'trufflehog_[0-9.]*_linux_amd64\.tar\.gz' /tmp/th.tgz \
  && tar -xzf /tmp/th.tgz -C /usr/local/bin trufflehog
gh_release_dl gitleaks/gitleaks 'gitleaks_[0-9.]*_linux_x64\.tar\.gz' /tmp/gl.tgz \
  && tar -xzf /tmp/gl.tgz -C /usr/local/bin gitleaks

curl -fsSL https://github.com/google/go-containerregistry/releases/latest/download/go-containerregistry_Linux_x86_64.tar.gz \
  -o /tmp/crane.tgz && tar -xzf /tmp/crane.tgz -C /usr/local/bin crane
curl -fsSL https://github.com/regclient/regclient/releases/latest/download/regctl-linux-amd64 \
  -o /usr/local/bin/regctl && chmod +x /usr/local/bin/regctl
curl -fsSL https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 \
  -o /usr/local/bin/yq && chmod +x /usr/local/bin/yq

# Cloud enumeration / exploitation via pipx
install_pipx_tool pacu
install_pipx_tool scoutsuite
install_pipx_tool prowler
install_pipx_tool s3scanner
install_pipx_tool checkov
install_pipx_tool cloudsplaining
install_pipx_tool roadrecon

install_pip_tool firefox_decrypt https://github.com/unode/firefox_decrypt.git firefox_decrypt.py

# enumerate-iam has no PyPI release. Its CLI is enumerate-iam.py at the repo root
# (enumerate_iam/main.py is a library module), and it imports its own package by
# name, so PYTHONPATH must point at the repo root.
install_pip_tool enumerate-iam https://github.com/andresriancho/enumerate-iam.git ""
printf '#!/bin/sh\nexec env PYTHONPATH=/opt/enumerate-iam /opt/enumerate-iam/venv/bin/python /opt/enumerate-iam/enumerate-iam.py "$@"\n' > /usr/local/bin/enumerate-iam
chmod +x /usr/local/bin/enumerate-iam

# Shared venv with the cloud SDKs, exposed as `cloud-python` for ad-hoc scripting.
python3 -m venv /opt/cloudsdk-venv
/opt/cloudsdk-venv/bin/pip install --no-cache-dir \
    boto3 botocore google-cloud-storage google-auth google-api-python-client \
    azure-identity azure-storage-blob azure-mgmt-resource requests pyjwt kubernetes
# NB: a symlink to the venv python does not resolve the venv — use a wrapper.
printf '#!/bin/sh\nexec /opt/cloudsdk-venv/bin/python "$@"\n' > /usr/local/bin/cloud-python
chmod +x /usr/local/bin/cloud-python

echo
echo "All tools installed. Available in any shell:"
echo "  web:   ffuf, subfinder, dirsearch, sqlmap, nuclei, etc."
echo "  cloud: aws, gcloud, az, aliyun, doctl, kubectl, pacu, cloudfox,"
echo "         enumerate-iam, scout, prowler, s3scanner, trufflehog, crane, cloud-python"
echo
