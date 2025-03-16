import axios from "axios";
import getSecrets from "../getSecrets";

export const generateAadhaarOtpService = async (aadhaarNumber: string) => {
  try {
    const surepassBaseURL = await getSecrets("SUREPASS-BASE-URL");
    const surepassAuthToken = await getSecrets("SUREPASS-AUTH-TOKEN");

    if (!surepassBaseURL || !surepassAuthToken) {
      throw new Error("SUREPASS_BASE_URL or AuthToken not set");
    }

    const aadharResponse = await axios.post(
      `${surepassBaseURL}/api/v1/aadhaar-v2/generate-otp`,
      {
        id_number: aadhaarNumber,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${surepassAuthToken}`,
        },
      }
    );

    return aadharResponse.data;
  } catch (err: any) {
    return err.response.data;
  }
};

export const verifyAadhaarOtpService = async (
  clientID: string,
  otp: string
) => {
  const surepassBaseURL = await getSecrets("SUREPASS-BASE-URL");
  const surepassAuthToken = await getSecrets("SUREPASS-AUTH-TOKEN");

  if (!surepassBaseURL || !surepassAuthToken) {
    throw new Error("SUREPASS_BASE_URL or AuthToken not set");
  }

  try {
    const aadharResponse = await axios.post(
      `${surepassBaseURL}/api/v1/aadhaar-v2/submit-otp`,
      {
        client_id: clientID.toString(),
        otp: otp.toString(),
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${surepassAuthToken}`,
        },
      }
    );
    return aadharResponse.data;
  } catch (err: any) {
    console.log("err in service", err.response.data);
    return err.response.data;
  }
};

export const verifyPanService = async (pan: string) => {
  const surepassBaseURL = await getSecrets("SUREPASS-BASE-URL");
  const surepassAuthToken = await getSecrets("SUREPASS-AUTH-TOKEN");

  if (!surepassBaseURL || !surepassAuthToken) {
    throw new Error("SUREPASS_BASE_URL or AuthToken not set");
  }

  const panResponse = await axios.post(
    `${surepassBaseURL}/api/v1/pan/pan`,
    {
      id_number: pan,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${surepassAuthToken}`,
      },
    }
  );

  return panResponse.data;
};

export const createPassportClient = async () => {
  try {
    const surepassBaseURL = await getSecrets("SUREPASS-BASE-URL");
    const surepassAuthToken = await getSecrets("SUREPASS-AUTH-TOKEN");

    if (!surepassBaseURL || !surepassAuthToken) {
      throw new Error("SUREPASS_BASE_URL or AuthToken not set");
    }

    const response = await axios.post(
      `${surepassBaseURL}/api/v1/passport/passport/create`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${surepassAuthToken}`,
        },
      }
    );

    return response.data;
  } catch (err: any) {
    return err.response.data;
  }
};

export const verifyPassportService = async (clientID: string, file: any) => {
  try {
    const surepassBaseURL = await getSecrets("SUREPASS-BASE-URL");
    const surepassAuthToken = await getSecrets("SUREPASS-AUTH-TOKEN");

    if (!surepassBaseURL || !surepassAuthToken) {
      throw new Error("SUREPASS_BASE_URL or AuthToken not set");
    }

    const formHeaders = file.getHeaders();

    const response = await axios.post(
      `${surepassBaseURL}/api/v1/passport/passport/${clientID}/upload`,
      file,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${surepassAuthToken}`,
          ...formHeaders,
        },
      }
    );

    return response.data;
  } catch (err: any) {
    return err.response.data;
  }
};
