import { Box } from '@mui/material';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { brand } from '../theme';

export default function Stars({ value, size = 18 }) {
  return (
    <Box sx={{ display: 'inline-flex' }} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarRoundedIcon key={i} sx={{ fontSize: size, color: i <= value ? brand.star : 'action.disabled' }} />
      ))}
    </Box>
  );
}
