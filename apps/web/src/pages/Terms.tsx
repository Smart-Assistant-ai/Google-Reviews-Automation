import { Link, Typography } from '@mui/material';
import { LegalPage, Section } from '../components/PublicLayout';
import { COMPANY, CONTACT_EMAIL, LEGAL_UPDATED } from '../legal';

export default function Terms() {
  const mail = <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>;
  return (
    <LegalPage title="Terms of service" updated={LEGAL_UPDATED}>
      <Typography>
        These terms govern your use of ReplyPilot, a service from {COMPANY} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By creating an account or using ReplyPilot, you agree to them. If you use
        ReplyPilot for a business, you agree on its behalf and confirm you may do so.
      </Typography>

      <Section title="1. The service">
        <Typography>
          ReplyPilot connects to the Google Business Profiles you manage, shows their reviews,
          drafts replies with AI, and posts the replies you approve. We may improve or change
          features over time.
        </Typography>
      </Section>

      <Section title="2. Your account">
        <Typography>
          Keep your login details safe and tell us at {mail} if you think someone else has used your
          account. You are responsible for what happens in your workspace, including what your
          invited colleagues do.
        </Typography>
      </Section>

      <Section title="3. Your Google Business Profile">
        <Typography>
          Connect only Business Profiles you own or are allowed to manage. You can disconnect at any
          time. Your use of Google&apos;s services remains subject to Google&apos;s own terms and
          policies, including its rules for review replies. ReplyPilot is not made or endorsed by
          Google.
        </Typography>
      </Section>

      <Section title="4. Replies and AI drafts">
        <Typography>
          AI drafts can be wrong or unsuitable. Read every draft before you post it. Replies are
          public and appear under your business&apos;s name, and you are responsible for them.
          Google may decline or remove a reply under its policies.
        </Typography>
      </Section>

      <Section title="5. Acceptable use">
        <Typography>Don&apos;t use ReplyPilot to:</Typography>
        <ul>
          <li>
            post replies that are misleading, offensive, or break the law or Google&apos;s policies;
          </li>
          <li>manage a profile you aren&apos;t allowed to manage;</li>
          <li>try to break, overload or get around the security of the service;</li>
          <li>resell the service or copy it.</li>
        </ul>
        <Typography>We may suspend an account that breaks these rules.</Typography>
      </Section>
    </LegalPage>
  );
}
