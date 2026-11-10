import { Card, CircularProgress, List, ListItem, ListItemText, Typography } from '@mui/material';
import { useActivity } from '../../api/hooks';
import { timeAgo } from '../../components/format';

const ACTION_LABELS: Record<string, string> = {
  'google.connected': 'Connected a Google account',
  'google.disconnected': 'Disconnected a Google account',
  'google.sample_enabled': 'Started using sample data',
  'google.sample_disabled': 'Stopped using sample data',
  'location.activated': 'Added locations',
  'location.deactivated': 'Stopped managing a location',
  'location.connection_changed': 'Changed the Google account for a location',
  'reply.posted': 'Posted a reply',
  'reply.edited': 'Edited a draft',
  'reply.regenerated': 'Asked for a new draft',
  'reply.deleted': 'Deleted a reply',
  'voice.updated': 'Changed the reply voice',
  'voice.location_updated': 'Changed the voice for a location',
  'voice.location_cleared': 'Reset the voice for a location',
  'member.updated': 'Changed a team member’s access',
  'member.removed': 'Removed a team member',
  'member.left': 'Left the workspace',
  'invitation.created': 'Invited someone',
  'invitation.revoked': 'Revoked an invitation',
  'invitation.accepted': 'Joined the workspace',
  'workspace.created': 'Created the workspace',
  'workspace.renamed': 'Renamed the workspace',
  'workspace.ownership_transferred': 'Transferred ownership',
};

// What the action was about, from what the API recorded with it: who was invited,
// which Google account, which locations.
function detailOf(meta: Record<string, unknown>): string | null {
  if (Array.isArray(meta.locations)) return meta.locations.join(', ');
  for (const key of ['email', 'title', 'to', 'name']) {
    if (typeof meta[key] === 'string' && meta[key]) return meta[key] as string;
  }
  return null;
}

export default function ActivityTab() {
  const { data: rows } = useActivity();
  if (!rows) return <CircularProgress />;
  if (!rows.length) return <Typography color="text.secondary">No activity yet.</Typography>;
  return (
    <Card>
      <List disablePadding>
        {rows.map((row, i) => (
          <ListItem key={row.id} divider={i < rows.length - 1}>
            <ListItemText
              primary={
                <>
                  {ACTION_LABELS[row.action] ?? row.action}
                  {detailOf(row.meta) && (
                    <Typography component="span" variant="body2" color="text.secondary">
                      {' · '}
                      {detailOf(row.meta)}
                    </Typography>
                  )}
                </>
              }
              primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
              secondary={row.actorName}
            />
            <Typography variant="caption" color="text.secondary">
              {timeAgo(row.createdAt)}
            </Typography>
          </ListItem>
        ))}
      </List>
    </Card>
  );
}
