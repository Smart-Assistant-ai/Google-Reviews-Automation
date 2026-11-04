import { Grid, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

export const TONES = [
  { value: 'warm', label: 'Warm', hint: 'Personal and genuine' },
  { value: 'professional', label: 'Professional', hint: 'Polite and concise' },
  { value: 'playful', label: 'Playful', hint: 'Friendly, light humour' },
];

export default function VoiceForm({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <Grid container spacing={2.5}>
      <Grid item xs={12}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Tone</Typography>
        <ToggleButtonGroup
          exclusive value={value.tone || 'warm'} color="primary"
          onChange={(_, tone) => tone && onChange({ ...value, tone })}
          sx={{ flexWrap: 'wrap' }}
        >
          {TONES.map((t) => (
            <ToggleButton key={t.value} value={t.value} sx={{ px: 2.5, flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.label}</Typography>
              <Typography variant="caption" color="text.secondary">{t.hint}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField label="Business name" value={value.businessName || ''} onChange={set('businessName')} fullWidth />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField label="Owner / manager name" value={value.ownerName || ''} onChange={set('ownerName')} fullWidth />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField label="Sign-off" placeholder="– The Harbor & Pine team" value={value.signOff || ''} onChange={set('signOff')} fullWidth />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField select label="Reply language" value={value.languageMode || 'match'} onChange={set('languageMode')} fullWidth>
          <MenuItem value="match">Match the reviewer&apos;s language</MenuItem>
          <MenuItem value="english">Always English</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Things to mention when natural" placeholder="Our rooftop terrace, the cable car stop outside"
          value={value.alwaysSay || ''} onChange={set('alwaysSay')} fullWidth multiline minRows={2}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Never mention" placeholder="Competitors, prices"
          value={value.neverSay || ''} onChange={set('neverSay')} fullWidth multiline minRows={2}
        />
      </Grid>
    </Grid>
  );
}
