import { TransactionDetail } from "@/components/transaction-detail";

interface TransactionPageProps {
  params: Promise<{
    transactionId: string;
  }>;
}

export default async function TransactionPage({
  params,
}: TransactionPageProps) {
  const { transactionId } = await params;
  return <TransactionDetail transactionId={transactionId} />;
}
