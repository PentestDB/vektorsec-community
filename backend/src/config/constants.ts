export const MAX_FILE_SIZE_BYTES = 2097152; // 2MB
export const MAX_ANALYSIS_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const CONTAINER_EXPIRY_MS = 65 * 60 * 1000; // 65 minutes

export const VNC_GEOMETRY = "1280x800";
export const VNC_DEPTH = 24;
export const VNC_DISPLAY = ":1";
export const WEBSOCKIFY_PORT = 9020;
export const WEBSOCKIFY_TARGET = "localhost:5901";

export const KALI_API_PORT = 5000;
export const KALI_API_PATH = "/api";

export const SESSION_NAME_MAX_LENGTH = 50;
export const SESSION_DESC_MAX_LENGTH = 500;

export const OPENVPN_CONFIG_PATH = "/root/openvpn.ovpn";
export const OPENVPN_START_CMD = `openvpn --config ${OPENVPN_CONFIG_PATH} --daemon && echo '|<<<<STARTED>>>>|'`;
export const OPENVPN_KILL_CMD = "pkill openvpn";

export const KALI_DATA_DIR = "./kali-data";

export const LLM_RETRY_DELAY_MS = 5000;

export const DEFAULT_MAX_EC2_INSTANCES = 5;
