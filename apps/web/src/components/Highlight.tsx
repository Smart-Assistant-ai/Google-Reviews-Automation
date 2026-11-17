import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Fragment } from 'react';
import { brand } from '../theme';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Marks where the search matched. The API matches the whole phrase, ignoring case, so this does too.
export default function Highlight({ text, query }: { text: string; query?: string }) {
  const phrase = query?.trim();
  if (!phrase) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escape(phrase)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        // split puts each match at an odd index.
        i % 2 === 1 ? (
          <Box
            key={i}
            component="mark"
            sx={{
              bgcolor: alpha(brand.star, 0.3),
              color: 'inherit',
              borderRadius: '3px',
              px: '1px',
            }}
          >
            {part}
          </Box>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
