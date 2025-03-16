// Regex for validating Github, LinkedIn, Twitter, Blog, TryHackMe, HackTheBox
export const githubregex =
  /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9.-]+\/?$/gm;

export const linkedinregex =
  /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9.-]+\/?$/gm;

export const twitterregex =
  /http(?:s)?:\/\/(?:www\.)?twitter\.com\/([a-zA-Z0-9_]+)/gm;

export const facebookregex =
  /^(https?:\/\/)?(www\.)?facebook\.com\/[a-zA-Z0-9.-]+\/?$/gm;

export const instagramregex =
  /^((http|https):\/\/)?(www\.)?instagram\.com\/([A-Za-z0-9_](?:(?:[A-Za-z0-9_]|(?:\\.(?![\\.\\s]))){0,28}(?:[A-Za-z0-9_]))?)\/?$/gm;

export const blogregex =
  /^(http(s):\/\/.)[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)$/gm;

export const tryHackmeregex =
  /^(https?:\/\/)?(www\.)?tryhackme\.com\/p\/[a-zA-Z0-9.-]+\/?$/gm;

export const hackTheBoxregex =
  /^(https?:\/\/)?(www\.)?app\.hackthebox\.com\/profile\/[a-zA-Z0-9.-]+\/?$/gm;

export const ipAddressRegex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,20})+$/;

export const nameregex = /^[A-Za-z]+$/;
export const regStringregex = /^[a-zA-Z0-9 ]*$/;
export const usernameRegex = /^[a-z0-9$,+!@#()*&^%<>.+|~_-]+$/;
export const genericS3Regex =
  /https:\/\/(?<bucket>[^.]+)\.s3\..*\.amazonaws\.com\/(?<key>[a-zA-Z0-9/\-_+.]+)/g;
export const genericS3ExecRegex =
  /https:\/\/(?<bucket>[^.]+)\.s3\..*\.amazonaws\.com\/(?<key>[a-zA-Z0-9/\-_+.]+)/;
export const genericAzureBlobRegex =
  /https:\/\/(?<account>[^.]+)\.blob\.core\.windows\.net\/(?<container>[^/]+)\/(?<key>[a-zA-Z0-9/\-_+.]+)/g;
export const genericAzureBlobExecRegex =
  /https:\/\/(?<account>[^.]+)\.blob\.core\.windows\.net\/(?<container>[^/]+)\/(?<key>[a-zA-Z0-9/\-_+.]+)/;
