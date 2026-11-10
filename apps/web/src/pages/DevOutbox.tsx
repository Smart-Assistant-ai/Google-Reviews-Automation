import type { Outbox } from '@replypilot/shared';
import { Alert, Card, CardContent, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { api } from '../api/client';
import AuthLayout from '../components/AuthLayout';
import { timeAgo } from '../components/format';

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function WithLinks({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, i) =>
        URL_PATTERN.test(part) ? (
          <Link key={i} href={part} sx={{ wordBreak: 'break-all' }}>
            {part}
          </Link>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// Local development only: the emails this machine would have sent, newest first.
export default function DevOutbox() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dev-outbox'],
    queryFn: () => api.get<Outbox>('/dev/outbox'),
    refetchInterval: 3000,
  });

  return (
    <AuthLayout>
      <Typography variant="h5">Local inbox</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Email isn&apos;t sent from this machine, so it lands here instead. It clears when the API
        restarts.
      </Typography>
      {isLoading && <CircularProgress />}
      {error && <Alert severity="info">The local inbox is off because real email is set up.</Alert>}
      {data && data.emails.length === 0 && (
        <Typography color="text.secondary">Nothing yet.</Typography>
      )}
      <Stack spacing={2}>
        {data?.emails.map((email) => (
          <Card key={`${email.sentAt}-${email.to}`}>
            <CardContent>
              <Typography variant="subtitle2">{email.subject}</Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.5 }}>
                To {email.to} · {timeAgo(email.sentAt)}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                <WithLinks text={email.text} />
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </AuthLayout>
  );
}
