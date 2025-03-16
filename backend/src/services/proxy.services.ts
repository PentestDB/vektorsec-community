import axios from "axios";
import getSecrets from "../utils/getSecrets";

export const addInstanceDetails = async ({
  instanceId,
}: {
  instanceId: string;
}) => {
  try {
    const BASE_SSHPOOL_URL = "http://" + (await getSecrets("BASE-SSHPOOL-URL"));

    const response = await axios.post(
      `${BASE_SSHPOOL_URL}/update_ssh_connections`,
      {
        instanceId,
      }
    );

    return response.data;
  } catch (err: any) {
    console.log("addInstanceDetails", err.response.data);
  }
};

export const checkInstanceStatus = async ({
  instanceId,
}: {
  instanceId: string;
}) => {
  try {
    const BASE_SSHPOOL_URL = "http://" + (await getSecrets("BASE-SSHPOOL-URL"));

    const response = await axios.post(
      `${BASE_SSHPOOL_URL}/check_ssh_connection`,
      {
        instanceId,
      }
    );

    return response.data;
  } catch (err: any) {
    console.log("checkInstanceStatus", err.response.data);
  }
};

// VPN Routes

export const connectToVPNThroughProxy = async ({
  instanceId,
  fileUrl,
}: {
  instanceId: string;
  fileUrl: string;
}) => {
  try {
    const BASE_SSHPOOL_URL = "http://" + (await getSecrets("BASE-SSHPOOL-URL"));

    const response = await axios.post(`${BASE_SSHPOOL_URL}/connect_vpn`, {
      instanceId,
      fileUrl,
    });

    return response.data;
  } catch (err: any) {
    console.log("connectToVPNThroughProxy", err.response.data);
  }
};

export const disconnectVPNThroughProxy = async ({
  instanceId,
}: {
  instanceId: string;
}) => {
  try {
    const BASE_SSHPOOL_URL = "http://" + (await getSecrets("BASE-SSHPOOL-URL"));

    const response = await axios.post(`${BASE_SSHPOOL_URL}/disconnect_vpn`, {
      instanceId,
    });

    return response.data;
  } catch (err: any) {
    console.log("disconnectVPNThroughProxy", err.response.data);
  }
};

export const checkVPNStatusThroughProxy = async ({
  instanceId,
}: {
  instanceId: string;
}) => {
  try {
    const BASE_SSHPOOL_URL = "http://" + (await getSecrets("BASE-SSHPOOL-URL"));

    const response = await axios.post(`${BASE_SSHPOOL_URL}/vpn_status`, {
      instanceId,
    });

    return response.data;
  } catch (err: any) {
    console.log("checkVPNStatusThroughProxy", err.response.data);
  }
};
