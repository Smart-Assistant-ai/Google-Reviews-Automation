import type { Voice } from '@replypilot/shared';
import {
  Box,
  Grid,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { ChangeEvent } from 'react';

export const TONES = [
  { value: 'warm', label: 'Warm', hint: 'Personal and genuine' },
  { value: 'professional', label: 'Professional', hint: 'Polite and concise' },
  { value: 'playful', label: 'Playful', hint: 'Friendly, light humour' },
] as const;

export default function VoiceForm({
  value,
  onChange,
  disabled,
}: {
  value: Voice;
  onChange: (voice: Voice) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof Voice) => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.value });
  // The Box keeps the grid's own edge spacing. A parent Stack would reset it and push
  // the form out of line with the rest of the page.
  return (
    <Box>
      <Grid container spacing={2.5}>
        <Grid item xs={12}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Tone
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={value.tone}
            color="primary"
            disabled={disabled}
            onChange={(_, tone: Voice['tone'] | null) => tone && onChange({ ...value, tone })}
            sx={{ flexWrap: 'wrap' }}
          >
            {TONES.map((t) => (
              <ToggleButton
                key={t.value}
                value={t.value}
                sx={{ px: 2.5, flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.hint}
                </Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Business name"
            value={value.businessName ?? ''}
            onChange={set('businessName')}
            fullWidth
            disabled={disabled}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Owner / manager name"
            value={value.ownerName ?? ''}
            onChange={set('ownerName')}
            fullWidth
            disabled={disabled}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Sign-off"
            placeholder="– The team at your business"
            value={value.signOff ?? ''}
            onChange={set('signOff')}
            fullWidth
            disabled={disabled}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            label="Reply language"
            value={value.languageMode}
            onChange={set('languageMode')}
            fullWidth
            disabled={disabled}
          >
            <MenuItem value="match">Match the reviewer&apos;s language</MenuItem>
            <MenuItem value="english">Always English</MenuItem>
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Things to mention when natural"
            placeholder="Free parking behind the building, open on Sundays"
            value={value.alwaysSay ?? ''}
            onChange={set('alwaysSay')}
            fullWidth
            multiline
            minRows={2}
            disabled={disabled}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Never mention"
            placeholder="Competitors, prices"
            value={value.neverSay ?? ''}
            onChange={set('neverSay')}
            fullWidth
            multiline
            minRows={2}
            disabled={disabled}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
