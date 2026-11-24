import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { IconButton, InputAdornment, TextField, Tooltip, type TextFieldProps } from '@mui/material';
import { useState } from 'react';

// A password box with an eye button, so people can check what they typed before submitting.
export default function PasswordField(props: Omit<TextFieldProps, 'type'>) {
  const [shown, setShown] = useState(false);
  const label = shown ? 'Hide password' : 'Show password';
  return (
    <TextField
      {...props}
      type={shown ? 'text' : 'password'}
      // Password managers fill these in without telling the page, so the label stays above the
      // box and never lands on top of the filled-in password.
      InputLabelProps={{ shrink: true, ...props.InputLabelProps }}
      InputProps={{
        ...props.InputProps,
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title={label}>
              <IconButton
                aria-label={label}
                onClick={() => setShown((value) => !value)}
                // Keeps the cursor in the box while the button is clicked.
                onMouseDown={(e) => e.preventDefault()}
                edge="end"
                disabled={props.disabled}
              >
                {shown ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
}
