import { Request } from "express";
import multer from "multer";

// Allows only JPG and PNG files
const imageFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: any
) => {
  if (
    (file.mimetype === "image/jpeg" || file.mimetype === "image/png") &&
    ["png", "jpg", "jpeg"].includes(
      file.originalname
        .split(".")
        [file.originalname.split(".").length - 1]?.toLowerCase()
    )
  ) {
    callback(null, true);
  } else {
    const error = new Error("Invalid file type, only JPG and PNG is allowed!");

    error.stack = "Invalid file type, only JPG and PNG is allowed!";

    error.name = "InvalidFileTypeError";

    callback(error, false);
  }
};

const documentFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: any
) => {
  if (
    (file.mimetype === "application/pdf" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.mimetype === "text/plain") &&
    ["png", "jpg", "jpeg", "pdf", "zip", "txt"].includes(
      file.originalname
        .split(".")
        [file.originalname.split(".").length - 1]?.toLowerCase()
    )
  ) {
    callback(null, true);
  } else {
    const error = new Error(
      "Invalid file type, only PDF, TXT, PNG, JPEG and ZIP is allowed!"
    );

    error.stack =
      "Invalid file type, only PDF, TXT, PNG, JPEG and ZIP is allowed!";

    error.name = "InvalidFileTypeError";

    callback(error, false);
  }
};

const mediaFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: any
) => {
  // accept document pdf images and video and check if theyre vulnerable or not
  if (
    (file.mimetype === "application/pdf" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "video/mp4" ||
      file.mimetype === "video/quicktime" ||
      file.mimetype === "video/mpeg" ||
      file.mimetype === "video/webm" ||
      file.mimetype === "video/x-msvideo" ||
      file.mimetype === "video/x-ms-wmv" ||
      file.mimetype === "application/zip") &&
    [
      "png",
      "jpg",
      "jpeg",
      "pdf",
      "mp4",
      "mpg",
      "mpeg",
      "zip",
      "mov",
      "webm",
      "m4v",
      "wmv",
      "avi",
      "m4p",
    ].includes(
      file.originalname
        .split(".")
        [file.originalname.split(".").length - 1]?.toLowerCase()
    )
  ) {
    callback(null, true);
  } else {
    const error = new Error(
      "Invalid file type, only PDF, PNG, JPEG, MP4, MPG, MPEG, ZIP, MOV, WEBM, M4V, WMV, AVI, M4P is allowed!"
    );

    error.stack =
      "Invalid file type, only PDF, PNG, JPEG, MP4, MPG, MPEG, ZIP, MOV, WEBM, M4V, WMV, AVI, M4P is allowed!";

    error.name = "InvalidFileTypeError";

    callback(error, false);
  }
};

const csvFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: any
) => {
  if (
    file.mimetype === "text/csv" &&
    ["csv"].includes(
      file.originalname
        .split(".")
        [file.originalname.split(".").length - 1]?.toLowerCase()
    )
  ) {
    callback(null, true);
  } else {
    const error = new Error("Invalid file type, only CSV is allowed!");

    error.stack = "Invalid file type, only CSV is allowed!";

    error.name = "InvalidFileTypeError";

    callback(error, false);
  }
};

const openVPNFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: any
) => {
  if (
    ["ovpn"].includes(
      file.originalname
        .split(".")
        [file.originalname.split(".").length - 1]?.toLowerCase()
    )
  ) {
    callback(null, true);
  } else {
    const error = new Error("Invalid file type, only OVPN is allowed!");

    error.stack = "Invalid file type, only OVPN is allowed!";

    error.name = "InvalidFileTypeError";

    callback(error, false);
  }
};

const uploadImageMiddleware = multer({ fileFilter: imageFilter });
const uploadDocumentMiddleware = multer({ fileFilter: documentFileFilter });
const uploadMediaMiddleware = multer({ fileFilter: mediaFileFilter });
const uploadCsvMiddleware = multer({ fileFilter: csvFileFilter });
const uploadOpenVPNMiddleware = multer({ fileFilter: openVPNFileFilter });
const uploadMiddleware = multer({});

export {
  uploadImageMiddleware,
  uploadDocumentMiddleware,
  uploadMediaMiddleware,
  uploadCsvMiddleware,
  uploadOpenVPNMiddleware,
  uploadMiddleware,
};
