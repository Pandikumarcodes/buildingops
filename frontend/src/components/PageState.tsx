export function LoadingState() {
  return (
    <p className="page-state" role="status">
      Loading simulated building data…
    </p>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="page-state page-state--error" role="alert">
      Unable to load dashboard data: {message}
    </p>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="page-state">{message}</p>;
}
