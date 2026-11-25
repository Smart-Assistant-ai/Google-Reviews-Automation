import { Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
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

      <Section title="6. Trial, plans and payment">
        <ul>
          <li>
            Each workspace starts with a free 14-day trial that needs no card. When it ends, a paid
            plan is needed to draft and post replies. Your reviews, replies and settings stay
            available to read.
          </li>
          <li>
            Plans are priced by the number of locations you connect and billed monthly or yearly in
            advance through our payment provider, Stripe. We show the price before you pay. Prices
            don&apos;t include taxes unless we say so.
          </li>
          <li>
            Plans renew automatically until you cancel, which you can do at any time in Settings.
            Cancelling stops the next renewal, and you keep the plan until the end of the period you
            paid for.
          </li>
          <li>
            Connecting or removing locations changes the price, and the difference for the current
            period is charged or credited on your next invoice.
          </li>
          <li>
            If a payment fails, Stripe will try it again over the following days, and ReplyPilot
            shows a notice. If it still isn&apos;t paid, the workspace goes back to read-only until
            it is.
          </li>
          <li>
            Except where the law requires otherwise, payments aren&apos;t refundable. We&apos;ll
            tell you at least 30 days before a price change applies to you.
          </li>
        </ul>
      </Section>

      <Section title="7. Your data">
        <Typography>
          Your reviews, replies and settings stay yours. You let us use them only to run ReplyPilot
          for you, as our{' '}
          <Link component={RouterLink} to="/privacy">
            privacy policy
          </Link>{' '}
          explains.
        </Typography>
      </Section>

      <Section title="8. Availability and warranty">
        <Typography>
          We work to keep ReplyPilot running and accurate, but it is provided &ldquo;as is&rdquo;.
          We can&apos;t promise it will always be available or error-free, and it depends on
          Google&apos;s services, which we don&apos;t control.
        </Typography>
      </Section>

      <Section title="9. Limitation of liability">
        <Typography>
          To the extent the law allows, we aren&apos;t liable for indirect or consequential losses,
          such as lost profits or harm to reputation, and our total liability is limited to the
          amount you paid us in the 12 months before the claim.
        </Typography>
      </Section>

      <Section title="10. Ending your use">
        <Typography>
          You can stop at any time by deleting your account in Settings. We may end or suspend the
          service with notice, or without notice if you break these terms.
        </Typography>
      </Section>

      <Section title="11. Law">
        <Typography>
          {COMPANY} is a United States company. These terms are governed by the laws of the United
          States and of the state where {COMPANY} is registered, except where the law of your
          country gives you rights that can&apos;t be waived.
        </Typography>
      </Section>

      <Section title="12. Changes and contact">
        <Typography>
          We may update these terms. We&apos;ll change the date above and tell you before a
          significant change takes effect. Questions go to {mail}.
        </Typography>
      </Section>
    </LegalPage>
  );
}
