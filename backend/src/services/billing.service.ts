const getFormattedDate = (dateObj: Date) => {
  const date = new Date(dateObj);
  const month = date.toLocaleString("default", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

interface TransactionPerDay {
  date: string;
  commGenUsage: number;
  expBoxUsage: number;
}

interface MonthTransaction {
  date: Date;
  description: string;
  amount: number;
  type: string;
  usageType: string;
}

export interface BillingDetailsResult {
  transactionPerDay: TransactionPerDay[];
  monthTransactions: MonthTransaction[];
  commandDebit: number;
  commandCredit: number;
  exploitBoxDebit: number;
  exploitBoxCredit: number;
  remainingCommands?: number;
  remainingExploitBox?: number;
}

export function calculateBillingDetails(
  user: any,
  month: number,
  year: number
): BillingDetailsResult {
  const { credits, exploitBox } = user;

  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = new Date(year, month, 0);

  const allDatesInMonth: string[] = [];
  const currentDate = new Date(firstDayOfMonth);

  while (currentDate <= lastDayOfMonth) {
    allDatesInMonth.push(getFormattedDate(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const allTransactions = user.transactions.filter((transaction: any) => {
    const transactionDate = new Date(transaction.date);
    const transactionYear = transactionDate.getFullYear();
    const transactionMonth = transactionDate.getMonth() + 1;
    return (
      transactionMonth === month &&
      transactionYear === year &&
      (transaction.usageType === "command-gen" ||
        transaction.usageType === "exploit-box")
    );
  });

  const transactionPerDay: TransactionPerDay[] = [];
  const monthTransactions: MonthTransaction[] = [];

  let commandDebit = 0;
  let commandCredit = 0;
  let exploitBoxDebit = 0;
  let exploitBoxCredit = 0;

  if (allTransactions.length > 0) {
    allDatesInMonth.map((date) => {
      transactionPerDay.push({
        date,
        commGenUsage: 0,
        expBoxUsage: 0,
      });
    });

    for (let i = 0; i < allTransactions.length; i++) {
      const transaction = allTransactions[i];

      const entryIndex = transactionPerDay.findIndex(
        (entry) => entry.date === getFormattedDate(transaction.date)
      );

      if (entryIndex !== -1) {
        if (transaction.usageType === "command-gen") {
          if (transaction.type === "debit") {
            commandDebit += transaction.amount;
            transactionPerDay[entryIndex].commGenUsage += transaction.amount;
          } else {
            commandCredit += transaction.amount;
          }
        } else if (transaction.usageType === "exploit-box") {
          if (transaction.type === "debit") {
            exploitBoxDebit += transaction.amount;
            transactionPerDay[entryIndex].expBoxUsage += transaction.amount;
          } else {
            exploitBoxCredit += transaction.amount;
          }
        } else {
          continue;
        }
      }

      monthTransactions.unshift({
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        usageType: transaction.usageType,
      });
    }
  }

  let remainingCommands: number | undefined;
  let remainingExploitBox: number | undefined;

  if (
    month === new Date().getMonth() + 1 &&
    year === new Date().getFullYear()
  ) {
    remainingCommands = credits.remainingCredits - credits.usedCredits;
    remainingExploitBox = exploitBox.remainingHours - exploitBox.usedHours;
  }

  return {
    transactionPerDay,
    monthTransactions,
    commandDebit,
    commandCredit,
    exploitBoxDebit,
    exploitBoxCredit,
    remainingCommands,
    remainingExploitBox,
  };
}
