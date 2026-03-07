"use client";

export const getErrorMessage = (error, fallback = "Something went wrong") => {
  return error?.response?.data?.message ?? fallback;
};
