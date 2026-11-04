import { hasAtLeast, type Member } from '@replypilot/shared';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, FormGroup, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { api } from '../../api/client';
import { useInvitations, useMembers, useRefreshWorkspaceData, useWorkspaceId, wsPath } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import { managedLocations, useShell } from '../../layout/ShellContext';

function LocationChooser({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { status } = useShell();
  const locations = managedLocations(status);
  if (locations.length === 0) return <Typography variant="caption" color="text.secondary">No locations to choose from yet.</Typography>;
  return (
    <FormGroup>
      {locations.map((location) => (
        <FormControlLabel
          key={location.id}
          label={location.title}
          control={
            <Checkbox
              size="small" checked={value.includes(location.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, location.id] : value.filter((id) => id !== location.id))}
            />
          }
        />
      ))}
    </FormGroup>
  );
}

function AccessFields({ role, setRole, scopeAll, setScopeAll, locationIds, setLocationIds }: {
  role: 'admin' | 'member';
  setRole: (role: 'admin' | 'member') => void;
  scopeAll: boolean;
  setScopeAll: (scopeAll: boolean) => void;
  locationIds: string[];
  setLocationIds: (ids: string[]) => void;
}) {
  return (
    <Stack spacing={2}>
      <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')} fullWidth>
        <MenuItem value="admin">Admin: manages Google, locations and the team</MenuItem>
        <MenuItem value="member">Member: reads reviews and replies</MenuItem>
      </TextField>
      {role === 'member' && (
        <>
          <TextField select label="Locations" value={scopeAll ? 'all' : 'some'} onChange={(e) => setScopeAll(e.target.value === 'all')} fullWidth>
            <MenuItem value="all">All locations</MenuItem>
            <MenuItem value="some">Only the ones I choose</MenuItem>
          </TextField>
          {!scopeAll && <LocationChooser value={locationIds} onChange={setLocationIds} />}
        </>
      )}
    </Stack>
  );
}

export default function TeamTab() {
  const { workspace, session, reload } = useAuth();
  const role = workspace?.role ?? 'member';
  const isAdmin = hasAtLeast(role, 'admin');
  const isOwner = role === 'owner';
  const workspaceId = useWorkspaceId();
  const refresh = useRefreshWorkspaceData();
  const { status } = useShell();
  const titles = new Map((status?.locations ?? []).map((l) => [l.id, l.title]));
  const { data: members } = useMembers();
  const { data: invitations } = useInvitations(isAdmin);

  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviteAll, setInviteAll] = useState(true);
  const [inviteLocations, setInviteLocations] = useState<string[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);
  const [transferTo, setTransferTo] = useState<Member | null>(null);
  const [notice, setNotice] = useState('');

  if (!members) return <CircularProgress />;

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };

  const invite = async () => {
    const ok = await run(async () => {
      const res = await api.post<{ emailSent: boolean }>(wsPath(workspaceId, '/invitations'), { email, role: inviteRole, scopeAllLocations: inviteAll, locationIds: inviteLocations });
      setNotice(res.emailSent ? `Invitation sent to ${email}.` : `Invitation created, but the email failed to send. Try inviting ${email} again.`);
    });
    if (ok) {
      setInviting(false);
      setEmail('');
      setInviteLocations([]);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const ok = await run(() =>
      api.patch(wsPath(workspaceId, `/members/${editing.id}`), {
        role: editing.role === 'owner' ? undefined : editing.role,
        scopeAllLocations: editing.scopeAllLocations,
        locationIds: editing.locationIds,
      }),
    );
    if (ok) {
      setEditing(null);
      await reload();
    }
  };

  const describeAccess = (member: Member) => {
    if (member.role !== 'member' || member.scopeAllLocations) return 'All locations';
    if (member.locationIds.length === 0) return 'No locations yet';
    return member.locationIds.map((id) => titles.get(id) ?? 'Unknown location').join(', ');
  };

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      <Box>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>Team</Typography>
          {isAdmin && <Button size="small" variant="contained" onClick={() => setInviting(true)}>Invite someone</Button>}
        </Stack>
        <Stack spacing={1.5}>
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2" noWrap>{member.name ?? member.email}{member.isYou ? ' (you)' : ''}</Typography>
                      <Chip size="small" label={member.role} sx={{ textTransform: 'capitalize' }} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" component="div">{member.email}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">{describeAccess(member)}</Typography>
                  </Box>
                  {isAdmin && member.role !== 'owner' && <Button onClick={() => setEditing(member)}>Change access</Button>}
                  {isOwner && !member.isYou && <Button onClick={() => setTransferTo(member)}>Make owner</Button>}
                  {isAdmin && member.role !== 'owner' && !member.isYou && (
                    <Button color="error" onClick={() => void run(() => api.delete(wsPath(workspaceId, `/members/${member.id}`)))}>Remove</Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Box>

      {isAdmin && !!invitations?.length && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Pending invitations</Typography>
          <Stack spacing={1.5}>
            {invitations.map((invitation) => (
              <Card key={invitation.id}>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>{invitation.email}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{invitation.role}</Typography>
                    </Box>
                    <Button color="error" onClick={() => void run(() => api.delete(wsPath(workspaceId, `/invitations/${invitation.id}`)))}>Revoke</Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {!isOwner && (
        <Box>
          <Button color="error" onClick={() => void run(() => api.post(wsPath(workspaceId, '/leave'))).then(async (ok) => { if (ok) await reload(); })}>Leave this workspace</Button>
        </Box>
      )}

      <Dialog open={inviting} onClose={() => setInviting(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Invite someone</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth autoFocus />
            <AccessFields role={inviteRole} setRole={setInviteRole} scopeAll={inviteAll} setScopeAll={setInviteAll} locationIds={inviteLocations} setLocationIds={setInviteLocations} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviting(false)}>Cancel</Button>
          <Button variant="contained" disabled={!email.trim()} onClick={() => void invite()}>Send invitation</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Change access for {editing?.name ?? editing?.email}</DialogTitle>
        <DialogContent>
          {editing && editing.role !== 'owner' && (
            <Box sx={{ mt: 1 }}>
              <AccessFields
                role={editing.role} setRole={(next) => setEditing({ ...editing, role: next })}
                scopeAll={editing.scopeAllLocations} setScopeAll={(next) => setEditing({ ...editing, scopeAllLocations: next })}
                locationIds={editing.locationIds} setLocationIds={(next) => setEditing({ ...editing, locationIds: next })}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveEdit()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!transferTo} onClose={() => setTransferTo(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Make {transferTo?.name ?? transferTo?.email} the owner?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">Each workspace has one owner, so you&apos;ll become an admin ({session?.user.email}).</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferTo(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() =>
              void run(() => api.post(wsPath(workspaceId, '/transfer-ownership'), { memberId: transferTo!.id })).then(async (ok) => {
                setTransferTo(null);
                if (ok) await reload();
              })
            }
          >
            Transfer ownership
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
