import axios from "axios";
import getSecrets from "../utils/getSecrets";

async function getSurepassConfig() {
  const baseURL = await getSecrets("SUREPASS-BASE-URL");
  const authToken = await getSecrets("SUREPASS-AUTH-TOKEN");
  if (!baseURL || !authToken)
    throw new Error("SUREPASS_BASE_URL or AuthToken not set");
  return { baseURL, authToken };
}

function surepassHeaders(authToken: string, contentType = "application/json") {
  return {
    "Content-Type": contentType,
    Authorization: `Bearer ${authToken}`,
  };
}

export const generateAadhaarOtpService = async (aadhaarNumber: string) => {
  try {
    const { baseURL, authToken } = await getSurepassConfig();

    const response = await axios.post(
      `${baseURL}/api/v1/aadhaar-v2/generate-otp`,
      { id_number: aadhaarNumber },
      { headers: surepassHeaders(authToken) }
    );

    return response.data;
  } catch (err: any) {
    return err.response.data;
  }
};

export const verifyAadhaarOtpService = async (
  clientID: string,
  otp: string
) => {
  try {
    const { baseURL, authToken } = await getSurepassConfig();

    const response = await axios.post(
      `${baseURL}/api/v1/aadhaar-v2/submit-otp`,
      {
        client_id: clientID.toString(),
        otp: otp.toString(),
      },
      { headers: surepassHeaders(authToken) }
    );

    return response.data;
  } catch (err: any) {
    console.log("err in service", err.response.data);
    return err.response.data;
  }
};

export const verifyPanService = async (pan: string) => {
  const { baseURL, authToken } = await getSurepassConfig();

  const response = await axios.post(
    `${baseURL}/api/v1/pan/pan`,
    { id_number: pan },
    { headers: surepassHeaders(authToken) }
  );

  return response.data;
};

export const createPassportClient = async () => {
  try {
    const { baseURL, authToken } = await getSurepassConfig();

    const response = await axios.post(
      `${baseURL}/api/v1/passport/passport/create`,
      {},
      { headers: surepassHeaders(authToken) }
    );

    return response.data;
  } catch (err: any) {
    return err.response.data;
  }
};

export const verifyPassportService = async (clientID: string, file: any) => {
  try {
    const { baseURL, authToken } = await getSurepassConfig();

    const formHeaders = file.getHeaders();

    const response = await axios.post(
      `${baseURL}/api/v1/passport/passport/${clientID}/upload`,
      file,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${authToken}`,
          ...formHeaders,
        },
      }
    );

    return response.data;
  } catch (err: any) {
    return err.response.data;
  }
};
