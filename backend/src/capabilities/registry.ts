export interface Capability {
  name: string;
  type: "binary" | "python_package";
  bucket: string;
  label: string;
  description: string;
  usageHint?: string;
  installCommand: string;
  checkCommand: string;
  size: string;
}

export interface CapabilityBucket {
  id: string;
  label: string;
  description: string;
  promptContext: string;
  capabilities: Capability[];
}

const coreBucket: CapabilityBucket = {
  id: "core",
  label: "Core",
  description:
    "Always-present baseline: shell, Python3, compiler, text tools, git, curl, and essential Python packages.",
  promptContext: `You have a full Linux shell (run_bash) with: python3, gcc/g++, make, git, curl, wget,
netcat (nc), socat, ssh, file, strings, xxd, base64, openssl, jq, tmux, and standard
unix utilities. Python packages available (run_python_script): requests, pyyaml, beautifulsoup4,
Pillow, python-magic, chepy. You can install additional packages with pip or apt if needed.
Write and run Python scripts for any complex logic. Use chepy for encoding/decoding chains.`,
  capabilities: [
    {
      name: "python3",
      type: "binary",
      bucket: "core",
      label: "Python 3",
      description: "Primary scripting runtime. The agent writes and runs .py scripts for almost everything.",
      installCommand: "apt install -y python3 python3-pip python3-venv",
      checkCommand: "which python3",
      size: "80 MB",
    },
    {
      name: "gcc",
      type: "binary",
      bucket: "core",
      label: "GCC / G++",
      description: "Compile C/C++ exploits, challenge sources, helper programs.",
      installCommand: "apt install -y build-essential",
      checkCommand: "which gcc",
      size: "150 MB",
    },
    {
      name: "make",
      type: "binary",
      bucket: "core",
      label: "Make / CMake",
      description: "Build systems for compiling multi-file projects.",
      installCommand: "apt install -y make cmake",
      checkCommand: "which make",
      size: "15 MB",
    },
    {
      name: "git",
      type: "binary",
      bucket: "core",
      label: "Git",
      description: "Clone exploit repos, tools, challenge sources.",
      installCommand: "apt install -y git",
      checkCommand: "which git",
      size: "30 MB",
    },
    {
      name: "curl",
      type: "binary",
      bucket: "core",
      label: "curl / wget",
      description: "HTTP requests, file downloads.",
      installCommand: "apt install -y curl wget",
      checkCommand: "which curl",
      size: "5 MB",
    },
    {
      name: "nc",
      type: "binary",
      bucket: "core",
      label: "Netcat",
      description: "Raw TCP/UDP connections. Connect to challenge servers.",
      installCommand: "apt install -y netcat-openbsd",
      checkCommand: "which nc",
      size: "1 MB",
    },
    {
      name: "socat",
      type: "binary",
      bucket: "core",
      label: "Socat",
      description: "Advanced relay/proxy. Upgrade shells, port forwarding, PTY wrapping.",
      installCommand: "apt install -y socat",
      checkCommand: "which socat",
      size: "2 MB",
    },
    {
      name: "ssh",
      type: "binary",
      bucket: "core",
      label: "SSH / sshpass",
      description: "Remote access to challenge machines.",
      installCommand: "apt install -y openssh-client sshpass",
      checkCommand: "which ssh",
      size: "5 MB",
    },
    {
      name: "file",
      type: "binary",
      bucket: "core",
      label: "file",
      description: "Identify file types. First thing to run on any unknown file.",
      installCommand: "apt install -y file",
      checkCommand: "which file",
      size: "1 MB",
    },
    {
      name: "strings",
      type: "binary",
      bucket: "core",
      label: "strings",
      description: "Extract printable strings from binaries, firmware, memory dumps.",
      installCommand: "apt install -y binutils",
      checkCommand: "which strings",
      size: "20 MB",
    },
    {
      name: "xxd",
      type: "binary",
      bucket: "core",
      label: "xxd",
      description: "Hex dump / reverse hex dump. Essential for binary data manipulation.",
      installCommand: "apt install -y vim-common",
      checkCommand: "which xxd",
      size: "1 MB",
    },
    {
      name: "openssl",
      type: "binary",
      bucket: "core",
      label: "OpenSSL",
      description: "Quick crypto ops: hashing, cipher, certificate inspection, key generation.",
      installCommand: "apt install -y openssl",
      checkCommand: "which openssl",
      size: "5 MB",
    },
    {
      name: "jq",
      type: "binary",
      bucket: "core",
      label: "jq",
      description: "JSON parsing from shell.",
      installCommand: "apt install -y jq",
      checkCommand: "which jq",
      size: "2 MB",
    },
    {
      name: "tmux",
      type: "binary",
      bucket: "core",
      label: "tmux",
      description: "Session management. Run long processes, split work.",
      installCommand: "apt install -y tmux",
      checkCommand: "which tmux",
      size: "2 MB",
    },
    {
      name: "requests",
      type: "python_package",
      bucket: "core",
      label: "requests",
      description: "HTTP library. Default for any HTTP interaction.",
      installCommand: "pip install requests",
      checkCommand: "python3 -c 'import requests'",
      size: "2 MB",
    },
    {
      name: "pyyaml",
      type: "python_package",
      bucket: "core",
      label: "PyYAML",
      description: "YAML parsing for challenge configs.",
      installCommand: "pip install pyyaml",
      checkCommand: "python3 -c 'import yaml'",
      size: "1 MB",
    },
    {
      name: "beautifulsoup4",
      type: "python_package",
      bucket: "core",
      label: "BeautifulSoup4",
      description: "HTML/XML parsing.",
      installCommand: "pip install beautifulsoup4",
      checkCommand: "python3 -c 'import bs4'",
      size: "1 MB",
    },
    {
      name: "Pillow",
      type: "python_package",
      bucket: "core",
      label: "Pillow",
      description: "Image manipulation. Used across stego, forensics, and misc.",
      installCommand: "pip install Pillow",
      checkCommand: "python3 -c 'import PIL'",
      size: "15 MB",
    },
    {
      name: "python-magic",
      type: "python_package",
      bucket: "core",
      label: "python-magic",
      description: "Programmatic file command — detect MIME types in scripts.",
      installCommand: "pip install python-magic",
      checkCommand: "python3 -c 'import magic'",
      size: "1 MB",
    },
    {
      name: "chepy",
      type: "python_package",
      bucket: "core",
      label: "Chepy",
      description:
        "CyberChef in Python. Encoding, decoding, hashing, compression, crypto — 300+ operations chained fluently.",
      installCommand: "pip install chepy",
      checkCommand: "python3 -c 'import chepy'",
      size: "10 MB",
    },
  ],
};

const revBucket: CapabilityBucket = {
  id: "rev",
  label: "Reverse Engineering",
  description:
    "Binary analysis, decompilation, disassembly, and understanding compiled code.",
  promptContext: `Reverse engineering capabilities available:
- ghidra (headless): analyzeHeadless /tmp/proj proj -import binary -postScript DecompileAll.java
- radare2: r2 -A binary then afl (list funcs), pdf @ main (disasm func), VV (graph)
- gdb + pwndbg: gdb ./binary then checksec, info functions, disass main, telescope
- ltrace/strace: trace library calls or syscalls at runtime
- objdump/readelf/nm: quick static analysis of ELF structure and symbols
- upx: upx -d packed_binary to unpack UPX-compressed binaries
- uncompyle6/pycdc: decompile Python .pyc files back to source
Python: capstone (disasm), keystone (asm), pyelftools, lief (binary patching),
        r2pipe (script r2), unicorn (CPU emulation)`,
  capabilities: [
    {
      name: "ghidra",
      type: "binary",
      bucket: "rev",
      label: "Ghidra (headless)",
      description:
        "Industry-standard decompiler. Run headless via analyzeHeadless for scripted decompilation. Supports x86, ARM, MIPS, PPC.",
      usageHint: "analyzeHeadless /tmp/proj proj -import binary -postScript DecompileAll.java",
      installCommand:
        "apt install -y default-jdk && wget -q https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.0.1_build/ghidra_11.0.1_PUBLIC_20240130.zip -O /tmp/ghidra.zip && unzip -q /tmp/ghidra.zip -d /opt/ && ln -sf /opt/ghidra_*/support/analyzeHeadless /usr/local/bin/analyzeHeadless",
      checkCommand: "which analyzeHeadless || test -d /opt/ghidra_*",
      size: "700 MB",
    },
    {
      name: "r2",
      type: "binary",
      bucket: "rev",
      label: "Radare2",
      description: "Interactive disassembler, debugger, hex editor. Good for quick analysis.",
      usageHint: "r2 -A binary then afl (list funcs), pdf @ main (disasm), VV (graph)",
      installCommand: "apt install -y radare2",
      checkCommand: "which r2",
      size: "50 MB",
    },
    {
      name: "gdb",
      type: "binary",
      bucket: "rev",
      label: "GDB + pwndbg",
      description:
        "Debugger with exploit-dev plugin. Heap visualization, telescope, ROP search, vmmap.",
      usageHint: "gdb ./binary then checksec, info functions, disass main, telescope",
      installCommand:
        "apt install -y gdb && pip install pwndbg",
      checkCommand: "which gdb",
      size: "150 MB",
    },
    {
      name: "ltrace",
      type: "binary",
      bucket: "rev",
      label: "ltrace",
      description: "Trace library calls. See what libc functions a binary calls at runtime.",
      installCommand: "apt install -y ltrace",
      checkCommand: "which ltrace",
      size: "1 MB",
    },
    {
      name: "strace",
      type: "binary",
      bucket: "rev",
      label: "strace",
      description: "Trace syscalls. Understand what a binary does without reversing it.",
      installCommand: "apt install -y strace",
      checkCommand: "which strace",
      size: "2 MB",
    },
    {
      name: "upx",
      type: "binary",
      bucket: "rev",
      label: "UPX",
      description: "Unpack UPX-compressed binaries. Common in CTF.",
      usageHint: "upx -d packed_binary",
      installCommand: "apt install -y upx",
      checkCommand: "which upx",
      size: "1 MB",
    },
    {
      name: "uncompyle6",
      type: "python_package",
      bucket: "rev",
      label: "uncompyle6",
      description: "Decompile Python 2/3 bytecode (.pyc) back to source.",
      installCommand: "pip install uncompyle6",
      checkCommand: "python3 -c 'import uncompyle6'",
      size: "5 MB",
    },
    {
      name: "jadx",
      type: "binary",
      bucket: "rev",
      label: "JADX",
      description: "Java/Android APK decompiler. Produces readable Java source.",
      installCommand: "apt install -y jadx",
      checkCommand: "which jadx",
      size: "40 MB",
    },
    {
      name: "apktool",
      type: "binary",
      bucket: "rev",
      label: "apktool",
      description: "Decode/rebuild APK resources and smali code.",
      installCommand: "apt install -y apktool",
      checkCommand: "which apktool",
      size: "10 MB",
    },
    {
      name: "capstone",
      type: "python_package",
      bucket: "rev",
      label: "Capstone",
      description: "Multi-arch disassembly framework. Disassemble x86, ARM, MIPS from Python.",
      installCommand: "pip install capstone",
      checkCommand: "python3 -c 'import capstone'",
      size: "5 MB",
    },
    {
      name: "keystone-engine",
      type: "python_package",
      bucket: "rev",
      label: "Keystone",
      description: "Multi-arch assembler. Assemble instructions from Python.",
      installCommand: "pip install keystone-engine",
      checkCommand: "python3 -c 'import keystone'",
      size: "5 MB",
    },
    {
      name: "pyelftools",
      type: "python_package",
      bucket: "rev",
      label: "pyelftools",
      description: "Pure-Python ELF parsing. Read sections, symbols, relocations, DWARF debug info.",
      installCommand: "pip install pyelftools",
      checkCommand: "python3 -c 'import elftools'",
      size: "2 MB",
    },
    {
      name: "lief",
      type: "python_package",
      bucket: "rev",
      label: "LIEF",
      description: "Parse and modify ELF, PE, Mach-O binaries. Patch imports, sections, entrypoints.",
      installCommand: "pip install lief",
      checkCommand: "python3 -c 'import lief'",
      size: "15 MB",
    },
    {
      name: "r2pipe",
      type: "python_package",
      bucket: "rev",
      label: "r2pipe",
      description: "Radare2 Python bindings. Script r2 analysis from Python.",
      installCommand: "pip install r2pipe",
      checkCommand: "python3 -c 'import r2pipe'",
      size: "1 MB",
    },
    {
      name: "unicorn",
      type: "python_package",
      bucket: "rev",
      label: "Unicorn",
      description:
        "CPU emulator. Emulate x86, ARM, MIPS code snippets without running the full binary.",
      installCommand: "pip install unicorn",
      checkCommand: "python3 -c 'import unicorn'",
      size: "10 MB",
    },
  ],
};

const pwnBucket: CapabilityBucket = {
  id: "pwn",
  label: "Binary Exploitation",
  description:
    "Buffer overflows, ROP chains, format strings, heap exploitation, shellcoding.",
  promptContext: `Binary exploitation capabilities available:
- pwntools (Python): process/remote interaction, ELF parsing, ROP chain building, shellcraft,
  cyclic patterns, format string helpers. from pwn import *
- angr: symbolic execution, auto-solve crackmes, find winning inputs. import angr
- ROPgadget: ROPgadget --binary ./vuln [--ropchain]
- ropper: ropper -f ./vuln --search "pop rdi"
- one_gadget: one_gadget /path/to/libc.so.6
- seccomp-tools: seccomp-tools dump ./binary
- patchelf: patchelf --set-interpreter ./ld-linux.so --set-rpath . ./binary
- checksec: checksec --file=./binary (installed with pwntools)
- qemu-user-static: run non-x86 binaries
- nasm: write raw shellcode .asm files`,
  capabilities: [
    {
      name: "ROPgadget",
      type: "binary",
      bucket: "pwn",
      label: "ROPgadget",
      description:
        "Find ROP gadgets in any binary. --ropchain auto-generates chains.",
      usageHint: "ROPgadget --binary ./vuln [--ropchain]",
      installCommand: "pip install ROPgadget",
      checkCommand: "which ROPgadget",
      size: "3 MB",
    },
    {
      name: "ropper",
      type: "binary",
      bucket: "pwn",
      label: "Ropper",
      description: "Alternative gadget finder. Better filtering, JOP/SOP support.",
      usageHint: "ropper -f ./vuln --search \"pop rdi\"",
      installCommand: "pip install ropper",
      checkCommand: "which ropper",
      size: "5 MB",
    },
    {
      name: "one_gadget",
      type: "binary",
      bucket: "pwn",
      label: "one_gadget",
      description: "Find one-shot execve gadgets in libc. Give it the libc, get instant shell offsets.",
      usageHint: "one_gadget /path/to/libc.so.6",
      installCommand: "gem install one_gadget",
      checkCommand: "which one_gadget",
      size: "2 MB",
    },
    {
      name: "seccomp-tools",
      type: "binary",
      bucket: "pwn",
      label: "seccomp-tools",
      description: "Dump and analyze seccomp-bpf sandbox rules. Essential for sandboxed pwn challenges.",
      usageHint: "seccomp-tools dump ./binary",
      installCommand: "gem install seccomp-tools",
      checkCommand: "which seccomp-tools",
      size: "2 MB",
    },
    {
      name: "patchelf",
      type: "binary",
      bucket: "pwn",
      label: "patchelf",
      description:
        "Change ELF interpreter and RPATH. Use to run binaries against a specific libc locally.",
      usageHint: "patchelf --set-interpreter ./ld-linux.so --set-rpath . ./binary",
      installCommand: "apt install -y patchelf",
      checkCommand: "which patchelf",
      size: "1 MB",
    },
    {
      name: "nasm",
      type: "binary",
      bucket: "pwn",
      label: "NASM",
      description: "x86/x64 assembler. Write shellcode or custom assembly payloads.",
      installCommand: "apt install -y nasm",
      checkCommand: "which nasm",
      size: "5 MB",
    },
    {
      name: "qemu-user-static",
      type: "binary",
      bucket: "pwn",
      label: "QEMU User Static",
      description: "Run ARM, MIPS, RISC-V, PPC binaries on x86. Many CTFs use non-x86 targets.",
      installCommand: "apt install -y qemu-user-static",
      checkCommand: "which qemu-arm-static",
      size: "150 MB",
    },
    {
      name: "pwntools",
      type: "python_package",
      bucket: "pwn",
      label: "pwntools",
      description:
        "The exploit dev framework. Remote/local process interaction, ELF parsing, ROP builder, shellcraft, cyclic patterns, format string helpers, asm/disasm.",
      usageHint: "from pwn import *; checksec --file=./binary (bundled)",
      installCommand: "pip install pwntools",
      checkCommand: "python3 -c 'import pwn'",
      size: "50 MB",
    },
    {
      name: "angr",
      type: "python_package",
      bucket: "pwn",
      label: "angr",
      description:
        "Symbolic execution engine. Auto-solve crackmes, find inputs that reach specific code paths, bypass checks.",
      usageHint: "import angr; p = angr.Project('./binary')",
      installCommand: "pip install angr",
      checkCommand: "python3 -c 'import angr'",
      size: "400 MB",
    },
  ],
};

const cryptoBucket: CapabilityBucket = {
  id: "crypto",
  label: "Cryptography",
  description:
    "Cipher breaking, RSA attacks, hash cracking, number theory, custom crypto implementations.",
  promptContext: `Cryptography capabilities available:
- sagemath: sage -python script.py or sage interactive. Elliptic curves, LLL, finite fields.
- john: john --wordlist=/usr/share/wordlists/rockyou.txt hashes.txt
- hashcat: hashcat -m <mode> hash.txt wordlist.txt
- hashid: hashid '<hash_string>' — identify hash type
- RsaCtfTool: python3 RsaCtfTool.py -n <N> -e <e> --uncipher <c>
- xortool: xortool encrypted_file — guess XOR key
Python: pycryptodome (AES/RSA/DES/hashing), gmpy2 (fast bignum math),
        sympy (symbolic math), z3-solver (constraint solving),
        primefac (factorization), factordb-python (known factorizations)`,
  capabilities: [
    {
      name: "sagemath",
      type: "binary",
      bucket: "crypto",
      label: "SageMath",
      description:
        "Computer algebra system. Elliptic curves, lattice reduction (LLL), polynomial rings, finite fields, number theory.",
      usageHint: "sage -python script.py or sage interactive",
      installCommand: "apt install -y sagemath",
      checkCommand: "which sage",
      size: "2 GB",
    },
    {
      name: "john",
      type: "binary",
      bucket: "crypto",
      label: "John the Ripper",
      description: "CPU-based password/hash cracker. Supports 300+ hash formats.",
      usageHint: "john --wordlist=/usr/share/wordlists/rockyou.txt hashes.txt",
      installCommand: "apt install -y john",
      checkCommand: "which john",
      size: "30 MB",
    },
    {
      name: "hashcat",
      type: "binary",
      bucket: "crypto",
      label: "Hashcat",
      description: "GPU-accelerated hash cracker. Faster than john when GPU available.",
      usageHint: "hashcat -m <mode> hash.txt wordlist.txt",
      installCommand: "apt install -y hashcat",
      checkCommand: "which hashcat",
      size: "20 MB",
    },
    {
      name: "hashid",
      type: "binary",
      bucket: "crypto",
      label: "hashid",
      description: "Identify unknown hash types. Feed it a hash, get possible algorithms.",
      usageHint: "hashid '<hash_string>'",
      installCommand: "pip install hashid",
      checkCommand: "which hashid",
      size: "1 MB",
    },
    {
      name: "xortool",
      type: "binary",
      bucket: "crypto",
      label: "xortool",
      description: "Analyze XOR-encrypted data. Guess key length and probable key.",
      usageHint: "xortool encrypted_file",
      installCommand: "pip install xortool",
      checkCommand: "which xortool",
      size: "1 MB",
    },
    {
      name: "pycryptodome",
      type: "python_package",
      bucket: "crypto",
      label: "PyCryptodome",
      description:
        "Full crypto toolkit. AES, RSA, DES, ChaCha20, hashing, PKCS padding, stream ciphers, MACs.",
      installCommand: "pip install pycryptodome",
      checkCommand: "python3 -c 'import Crypto'",
      size: "15 MB",
    },
    {
      name: "gmpy2",
      type: "python_package",
      bucket: "crypto",
      label: "gmpy2",
      description:
        "Fast arbitrary-precision arithmetic with GMP. Modular exponentiation, inversion, GCD. 10-100x faster than native Python for big numbers.",
      installCommand: "pip install gmpy2",
      checkCommand: "python3 -c 'import gmpy2'",
      size: "10 MB",
    },
    {
      name: "sympy",
      type: "python_package",
      bucket: "crypto",
      label: "SymPy",
      description:
        "Symbolic math. Solve equations, simplify expressions, number theory functions (factorint, isprime, discrete_log).",
      installCommand: "pip install sympy",
      checkCommand: "python3 -c 'import sympy'",
      size: "30 MB",
    },
    {
      name: "z3-solver",
      type: "python_package",
      bucket: "crypto",
      label: "Z3 Solver",
      description:
        "SMT constraint solver from Microsoft. Solve systems of equations, bit-vector constraints, boolean satisfiability.",
      installCommand: "pip install z3-solver",
      checkCommand: "python3 -c 'import z3'",
      size: "30 MB",
    },
    {
      name: "primefac",
      type: "python_package",
      bucket: "crypto",
      label: "primefac",
      description: "Integer factorization (trial division, Pollard rho, ECM).",
      installCommand: "pip install primefac",
      checkCommand: "python3 -c 'import primefac'",
      size: "1 MB",
    },
    {
      name: "factordb-python",
      type: "python_package",
      bucket: "crypto",
      label: "factordb-python",
      description: "Query factordb.com for known factorizations of large numbers.",
      installCommand: "pip install factordb-python",
      checkCommand: "python3 -c 'import factordb'",
      size: "1 MB",
    },
  ],
};

const forensicsBucket: CapabilityBucket = {
  id: "forensics",
  label: "Forensics",
  description:
    "Disk images, memory dumps, packet captures, file carving, document analysis.",
  promptContext: `Forensics capabilities available:
- binwalk: binwalk -e firmware.bin — extract embedded files
- sleuthkit: mmls disk.img, fls -r -o <offset> disk.img, icat disk.img <inode>
- volatility3: vol -f memory.dmp windows.pslist, vol -f memory.dmp windows.filescan
- tshark: tshark -r capture.pcap -Y "http", tshark -r cap.pcap -z follow,tcp,ascii,0
- foremost/scalpel: foremost -i image.raw -o output/ — carve files
- exiftool: exiftool file.jpg — read/write metadata
- pdf-parser: pdf-parser.py -s /JavaScript document.pdf
- oletools: olevba document.docm — extract VBA macros
- ffmpeg: ffmpeg -i audio.wav -lavfi showspectrumpic=s=1024x512 spectrogram.png
Python: scapy (packet crafting), dpkt/pyshark (pcap parsing),
        oletools, PyPDF2 (PDF manipulation)`,
  capabilities: [
    {
      name: "binwalk",
      type: "binary",
      bucket: "forensics",
      label: "Binwalk",
      description:
        "Scan firmware/binaries for embedded files, file systems, compressed data.",
      usageHint: "binwalk -e firmware.bin (auto-extract embedded files)",
      installCommand: "apt install -y binwalk",
      checkCommand: "which binwalk",
      size: "15 MB",
    },
    {
      name: "foremost",
      type: "binary",
      bucket: "forensics",
      label: "Foremost",
      description: "File carving from disk images or raw data based on headers/footers.",
      installCommand: "apt install -y foremost",
      checkCommand: "which foremost",
      size: "1 MB",
    },
    {
      name: "mmls",
      type: "binary",
      bucket: "forensics",
      label: "Sleuth Kit",
      description:
        "Filesystem forensics suite. Analyze disk images — list partitions, browse files, recover deleted files.",
      usageHint: "mmls disk.img, fls -r -o <offset> disk.img, icat disk.img <inode>",
      installCommand: "apt install -y sleuthkit",
      checkCommand: "which mmls",
      size: "20 MB",
    },
    {
      name: "vol",
      type: "binary",
      bucket: "forensics",
      label: "Volatility 3",
      description:
        "Memory forensics framework. Analyze RAM dumps — list processes, extract files, find credentials.",
      usageHint: "vol -f memory.dmp windows.pslist, vol -f memory.dmp windows.filescan",
      installCommand: "pip install volatility3",
      checkCommand: "which vol || python3 -c 'import volatility3'",
      size: "30 MB",
    },
    {
      name: "tshark",
      type: "binary",
      bucket: "forensics",
      label: "TShark",
      description: "CLI Wireshark. Parse pcap files, filter protocols, extract streams.",
      usageHint: "tshark -r capture.pcap -Y \"http\", tshark -r cap.pcap -z follow,tcp,ascii,0",
      installCommand: "apt install -y tshark",
      checkCommand: "which tshark",
      size: "80 MB",
    },
    {
      name: "exiftool",
      type: "binary",
      bucket: "forensics",
      label: "ExifTool",
      description: "Read/write metadata from images, PDFs, docs, videos, audio.",
      usageHint: "exiftool file.jpg",
      installCommand: "apt install -y libimage-exiftool-perl",
      checkCommand: "which exiftool",
      size: "25 MB",
    },
    {
      name: "oletools",
      type: "python_package",
      bucket: "forensics",
      label: "oletools",
      description: "Analyze Microsoft Office documents. Extract VBA macros, detect malicious content.",
      installCommand: "pip install oletools",
      checkCommand: "python3 -c 'import oletools'",
      size: "5 MB",
    },
    {
      name: "ffmpeg",
      type: "binary",
      bucket: "forensics",
      label: "FFmpeg",
      description: "Media file swiss-army knife. Extract frames, audio channels, manipulate for stego.",
      usageHint: "ffmpeg -i audio.wav -lavfi showspectrumpic=s=1024x512 spectrogram.png",
      installCommand: "apt install -y ffmpeg",
      checkCommand: "which ffmpeg",
      size: "80 MB",
    },
    {
      name: "scalpel",
      type: "binary",
      bucket: "forensics",
      label: "Scalpel",
      description: "File carver with more configurable rules than foremost.",
      installCommand: "apt install -y scalpel",
      checkCommand: "which scalpel",
      size: "1 MB",
    },
    {
      name: "scapy",
      type: "python_package",
      bucket: "forensics",
      label: "Scapy",
      description: "Packet crafting and analysis in Python. Parse pcaps, forge packets, decode protocols.",
      installCommand: "pip install scapy",
      checkCommand: "python3 -c 'import scapy'",
      size: "15 MB",
    },
    {
      name: "dpkt",
      type: "python_package",
      bucket: "forensics",
      label: "dpkt",
      description: "Lightweight pcap/packet parsing. Faster than scapy for simple pcap analysis.",
      installCommand: "pip install dpkt",
      checkCommand: "python3 -c 'import dpkt'",
      size: "2 MB",
    },
    {
      name: "pyshark",
      type: "python_package",
      bucket: "forensics",
      label: "PyShark",
      description: "Python wrapper for tshark. Use Wireshark's dissectors from Python.",
      installCommand: "pip install pyshark",
      checkCommand: "python3 -c 'import pyshark'",
      size: "5 MB",
    },
    {
      name: "PyPDF2",
      type: "python_package",
      bucket: "forensics",
      label: "PyPDF2",
      description: "PDF parsing and manipulation from Python.",
      installCommand: "pip install PyPDF2",
      checkCommand: "python3 -c 'import PyPDF2'",
      size: "3 MB",
    },
  ],
};

const stegoBucket: CapabilityBucket = {
  id: "stego",
  label: "Steganography",
  description:
    "Data hidden in images, audio, text, or other media.",
  promptContext: `Steganography capabilities available:
- steghide: steghide extract -sf image.jpg [-p password]
- zsteg: zsteg image.png — detect LSB stego in PNG/BMP
- stegoveritas: stegoveritas image.png — automated multi-check stego analysis
- pngcheck: pngcheck -v image.png — validate PNG chunk structure
- exiftool: check for metadata-hidden flags
- binwalk: check for appended/embedded files
- sonic-visualiser: visualize audio spectrograms (hidden images in audio)
Python: Pillow (pixel-level manipulation), numpy/scipy (bulk array + FFT for audio stego)
Technique: always check — file, strings, exiftool, binwalk, xxd first. Then specialized stego binaries.`,
  capabilities: [
    {
      name: "steghide",
      type: "binary",
      bucket: "stego",
      label: "Steghide",
      description: "Embed/extract data in JPEG and BMP files.",
      usageHint: "steghide extract -sf image.jpg [-p password]",
      installCommand: "apt install -y steghide",
      checkCommand: "which steghide",
      size: "2 MB",
    },
    {
      name: "zsteg",
      type: "binary",
      bucket: "stego",
      label: "zsteg",
      description: "Detect LSB steganography in PNG and BMP files. Finds hidden data in color channels/bit planes.",
      usageHint: "zsteg image.png",
      installCommand: "gem install zsteg",
      checkCommand: "which zsteg",
      size: "5 MB",
    },
    {
      name: "stegoveritas",
      type: "binary",
      bucket: "stego",
      label: "StegoVeritas",
      description:
        "Automated stego analysis. Runs multiple checks: LSB, color planes, trailing data, EXIF, binwalk.",
      usageHint: "stegoveritas image.png",
      installCommand: "pip install stegoveritas",
      checkCommand: "which stegoveritas",
      size: "20 MB",
    },
    {
      name: "pngcheck",
      type: "binary",
      bucket: "stego",
      label: "pngcheck",
      description: "Validate PNG structure. Detect corrupted or manipulated chunks (IHDR, IDAT, etc.).",
      usageHint: "pngcheck -v image.png",
      installCommand: "apt install -y pngcheck",
      checkCommand: "which pngcheck",
      size: "1 MB",
    },
    {
      name: "numpy",
      type: "python_package",
      bucket: "stego",
      label: "NumPy",
      description: "Array manipulation for bulk pixel/audio data processing.",
      installCommand: "pip install numpy",
      checkCommand: "python3 -c 'import numpy'",
      size: "30 MB",
    },
    {
      name: "scipy",
      type: "python_package",
      bucket: "stego",
      label: "SciPy",
      description: "Signal processing. FFT, audio analysis, image filtering for stego.",
      installCommand: "pip install scipy",
      checkCommand: "python3 -c 'import scipy'",
      size: "40 MB",
    },
  ],
};

const networkBucket: CapabilityBucket = {
  id: "network",
  label: "Network & Recon",
  description:
    "Port scanning, service enumeration, traffic capture, protocol interaction, web testing.",
  promptContext: `Network capabilities available:
- nmap: nmap -sV -sC <target> — port scan with version detection and default scripts
- masscan: masscan -p1-65535 <target> --rate=1000 — fast full-port scan
- tcpdump: tcpdump -i eth0 -w capture.pcap — packet capture
- dig: dig @<dns_server> <domain> ANY — DNS enumeration
- hydra: hydra -l admin -P wordlist.txt <target> ssh — brute-force logins
- sqlmap: sqlmap -u "http://target/page?id=1" --batch --dbs
Python: paramiko (SSH), dnspython (DNS), impacket (SMB/Kerberos/LDAP)`,
  capabilities: [
    {
      name: "nmap",
      type: "binary",
      bucket: "network",
      label: "Nmap",
      description:
        "Port scanner + service/version detection + NSE scripts. The starting point for any network challenge.",
      usageHint: "nmap -sV -sC <target> -oN scan.txt",
      installCommand: "apt install -y nmap",
      checkCommand: "which nmap",
      size: "25 MB",
    },
    {
      name: "masscan",
      type: "binary",
      bucket: "network",
      label: "Masscan",
      description: "Fastest port scanner. Scan entire networks quickly, then follow up with nmap.",
      usageHint: "masscan -p1-65535 <target> --rate=1000",
      installCommand: "apt install -y masscan",
      checkCommand: "which masscan",
      size: "5 MB",
    },
    {
      name: "tcpdump",
      type: "binary",
      bucket: "network",
      label: "tcpdump",
      description: "Lightweight packet capture. Faster to invoke than tshark for quick sniffing.",
      usageHint: "tcpdump -i eth0 -w capture.pcap",
      installCommand: "apt install -y tcpdump",
      checkCommand: "which tcpdump",
      size: "2 MB",
    },
    {
      name: "dig",
      type: "binary",
      bucket: "network",
      label: "dig / nslookup",
      description: "DNS lookups and zone transfers.",
      usageHint: "dig @<dns_server> <domain> ANY",
      installCommand: "apt install -y dnsutils",
      checkCommand: "which dig",
      size: "5 MB",
    },
    {
      name: "hydra",
      type: "binary",
      bucket: "network",
      label: "THC-Hydra",
      description: "Network brute-forcer. SSH, FTP, HTTP, SMB, SQL, etc.",
      usageHint: "hydra -l admin -P wordlist.txt <target> ssh",
      installCommand: "apt install -y hydra",
      checkCommand: "which hydra",
      size: "5 MB",
    },
    {
      name: "sqlmap",
      type: "binary",
      bucket: "network",
      label: "sqlmap",
      description: "Automated SQL injection detection and exploitation.",
      usageHint: "sqlmap -u \"http://target/page?id=1\" --batch --dbs",
      installCommand: "apt install -y sqlmap",
      checkCommand: "which sqlmap",
      size: "20 MB",
    },
    {
      name: "ffuf",
      type: "binary",
      bucket: "network",
      label: "ffuf",
      description: "Fast web fuzzer for directory and parameter brute-forcing.",
      installCommand: "apt install -y ffuf || go install github.com/ffuf/ffuf/v2@latest",
      checkCommand: "which ffuf",
      size: "10 MB",
    },
    {
      name: "feroxbuster",
      type: "binary",
      bucket: "network",
      label: "Feroxbuster",
      description: "Recursive content discovery tool written in Rust. Fast directory brute-forcing.",
      installCommand: "apt install -y feroxbuster",
      checkCommand: "which feroxbuster",
      size: "10 MB",
    },
    {
      name: "gobuster",
      type: "binary",
      bucket: "network",
      label: "Gobuster",
      description: "Directory/DNS/VHost brute-forcing tool written in Go.",
      installCommand: "apt install -y gobuster",
      checkCommand: "which gobuster",
      size: "10 MB",
    },
    {
      name: "dirsearch",
      type: "binary",
      bucket: "network",
      label: "dirsearch",
      description: "Web path scanner with recursive brute-force capabilities.",
      installCommand: "pip install dirsearch",
      checkCommand: "which dirsearch",
      size: "5 MB",
    },
    {
      name: "wfuzz",
      type: "binary",
      bucket: "network",
      label: "wfuzz",
      description: "Web application brute-forcer with flexible payloads and filters.",
      installCommand: "pip install wfuzz",
      checkCommand: "which wfuzz",
      size: "5 MB",
    },
    {
      name: "subfinder",
      type: "binary",
      bucket: "network",
      label: "Subfinder",
      description: "Fast passive subdomain enumeration tool.",
      installCommand: "apt install -y subfinder || go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest",
      checkCommand: "which subfinder",
      size: "15 MB",
    },
    {
      name: "amass",
      type: "binary",
      bucket: "network",
      label: "Amass",
      description: "In-depth attack surface mapping and asset discovery.",
      installCommand: "apt install -y amass",
      checkCommand: "which amass",
      size: "30 MB",
    },
    {
      name: "httpx",
      type: "binary",
      bucket: "network",
      label: "httpx",
      description: "Fast multi-purpose HTTP toolkit for probing and fingerprinting.",
      installCommand: "apt install -y httpx || go install github.com/projectdiscovery/httpx/cmd/httpx@latest",
      checkCommand: "which httpx",
      size: "15 MB",
    },
    {
      name: "naabu",
      type: "binary",
      bucket: "network",
      label: "naabu",
      description: "Fast port scanner written in Go, integrates with other ProjectDiscovery tools.",
      installCommand: "apt install -y naabu || go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest",
      checkCommand: "which naabu",
      size: "15 MB",
    },
    {
      name: "katana",
      type: "binary",
      bucket: "network",
      label: "Katana",
      description: "Next-generation crawling and spidering framework.",
      installCommand: "go install github.com/projectdiscovery/katana/cmd/katana@latest",
      checkCommand: "which katana",
      size: "15 MB",
    },
    {
      name: "whatweb",
      type: "binary",
      bucket: "network",
      label: "WhatWeb",
      description: "Web technology fingerprinting — identify CMS, frameworks, libraries.",
      installCommand: "apt install -y whatweb",
      checkCommand: "which whatweb",
      size: "10 MB",
    },
    {
      name: "wpscan",
      type: "binary",
      bucket: "network",
      label: "WPScan",
      description: "WordPress vulnerability scanner.",
      installCommand: "gem install wpscan",
      checkCommand: "which wpscan",
      size: "15 MB",
    },
    {
      name: "dalfox",
      type: "binary",
      bucket: "network",
      label: "DalFox",
      description: "Parameter analysis and XSS scanning tool.",
      installCommand: "go install github.com/hahwul/dalfox/v2@latest",
      checkCommand: "which dalfox",
      size: "10 MB",
    },
    {
      name: "waybackurls",
      type: "binary",
      bucket: "network",
      label: "WayBackURLs",
      description: "Fetch known URLs from the Wayback Machine for a domain.",
      installCommand: "go install github.com/tomnomnom/waybackurls@latest",
      checkCommand: "which waybackurls",
      size: "5 MB",
    },
    {
      name: "gau",
      type: "binary",
      bucket: "network",
      label: "gau",
      description: "Fetch known URLs from AlienVault OTX, Wayback Machine, and Common Crawl.",
      installCommand: "go install github.com/lc/gau/v2/cmd/gau@latest",
      checkCommand: "which gau",
      size: "5 MB",
    },
    {
      name: "gospider",
      type: "binary",
      bucket: "network",
      label: "GoSpider",
      description: "Fast web spider written in Go.",
      installCommand: "go install github.com/jaeles-project/gospider@latest",
      checkCommand: "which gospider",
      size: "10 MB",
    },
    {
      name: "paramiko",
      type: "python_package",
      bucket: "network",
      label: "Paramiko",
      description: "SSH client library. Programmatic remote command execution.",
      installCommand: "pip install paramiko",
      checkCommand: "python3 -c 'import paramiko'",
      size: "5 MB",
    },
    {
      name: "dnspython",
      type: "python_package",
      bucket: "network",
      label: "dnspython",
      description: "DNS toolkit. Queries, zone transfers, record manipulation from Python.",
      installCommand: "pip install dnspython",
      checkCommand: "python3 -c 'import dns'",
      size: "2 MB",
    },
    {
      name: "impacket",
      type: "python_package",
      bucket: "network",
      label: "Impacket",
      description: "Network protocol library. SMB, LDAP, Kerberos, MSSQL. Essential for AD/Windows.",
      installCommand: "pip install impacket",
      checkCommand: "python3 -c 'import impacket'",
      size: "20 MB",
    },
  ],
};

export const capabilityBuckets: CapabilityBucket[] = [
  coreBucket,
  networkBucket,
  revBucket,
  pwnBucket,
  cryptoBucket,
  forensicsBucket,
  stegoBucket,
];

export const allCapabilities: Capability[] = capabilityBuckets.flatMap(
  (b) => b.capabilities
);

export function getCapabilityByName(name: string): Capability | undefined {
  return allCapabilities.find((c) => c.name === name);
}

export function getBucketById(id: string): CapabilityBucket | undefined {
  return capabilityBuckets.find((b) => b.id === id);
}

export function getActiveBucketIds(selectedCapabilities: string[]): string[] {
  const bucketIds = new Set<string>();
  for (const name of selectedCapabilities) {
    const cap = getCapabilityByName(name);
    if (cap) bucketIds.add(cap.bucket);
  }
  return Array.from(bucketIds);
}

export function buildCapabilityPromptContext(
  installedCapabilities: string[]
): string {
  const activeBuckets = getActiveBucketIds(installedCapabilities);
  const sections: string[] = [];

  for (const bucketId of activeBuckets) {
    const bucket = getBucketById(bucketId);
    if (!bucket) continue;

    const installed = bucket.capabilities.filter((c) =>
      installedCapabilities.includes(c.name)
    );
    if (installed.length === 0) continue;

    const lines = installed.map((c) => {
      const hint = c.usageHint ? `: ${c.usageHint}` : "";
      return `- ${c.label} (${c.name})${hint} — ${c.description}`;
    });

    sections.push(`${bucket.label}:\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export function buildDetectionScript(capabilityNames: string[]): string {
  const checks: string[] = [];
  for (const name of capabilityNames) {
    const cap = getCapabilityByName(name);
    if (!cap) continue;
    checks.push(
      `echo -n "${cap.name}:"; ${cap.checkCommand} > /dev/null 2>&1 && echo "yes" || echo "no"`
    );
  }
  return checks.join(" ; ");
}

export function parseDetectionOutput(
  output: string
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  const lines = output.split("\n").filter(Boolean);
  for (const line of lines) {
    const [name, status] = line.split(":");
    if (name && status) {
      result[name.trim()] = status.trim() === "yes";
    }
  }
  return result;
}
