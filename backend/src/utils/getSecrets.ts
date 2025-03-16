require("dotenv").config();


const getSecrets = async (key: string) => {

  let secret = process.env[key];

  if (!secret) {
    console.error(`Secret ${key} not found`);
    return "";
  }

  return secret;
};

export default getSecrets;
