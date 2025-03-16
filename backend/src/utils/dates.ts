export const getFormattedDate = (dateObj: Date) => {
  const date = new Date(dateObj);

  const month = date.toLocaleString("default", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};
