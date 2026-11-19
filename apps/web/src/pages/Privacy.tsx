import { Link, Typography } from '@mui/material';
import { LegalPage, Section } from '../components/PublicLayout';
import { COMPANY, CONTACT_EMAIL, LEGAL_UPDATED } from '../legal';

// Google's verification asks for a policy that says how the app accesses, uses, stores and shares
// Google user data, matching what the app really does. Change it whenever that changes.
export default function Privacy() {
  const mail = <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>;
  return (
    <LegalPage title="Privacy policy" updated={LEGAL_UPDATED}>
      <Typography>
        ReplyPilot is a service from {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). It helps
        businesses answer the reviews on their Google Business Profile. This policy explains what
        information ReplyPilot collects, how we use it, and the choices you have. Questions go to{' '}
        {mail}.
      </Typography>

      <Section title="1. Information you give us">
        <ul>
          <li>
            Your account: your email address, your name if you add one, and your password, which we
            store only as a one-way hash. If you sign in with Google, we receive your Google
            account&apos;s email address and name.
          </li>
          <li>
            Your workspace: your business name, the reply voice you set (tone and sign-off), and the
            email addresses of colleagues you invite.
          </li>
          <li>The drafts and replies you write or edit in ReplyPilot.</li>
        </ul>
      </Section>

      <Section title="2. Information we receive from Google">
        <Typography>
          When you connect a Google Business Profile, Google asks you to let ReplyPilot manage it
          (the <code>business.manage</code> permission). With your permission, we receive:
        </Typography>
        <ul>
          <li>the email address of the Google account you connected;</li>
          <li>
            the Business Profile accounts and locations it manages, with their names and addresses;
          </li>
          <li>
            the reviews on the locations you choose: the reviewer&apos;s name and profile photo link
            as Google shows them, the star rating, the review text and photos, the dates, and any
            reply already posted;
          </li>
          <li>
            access tokens from Google, which we store encrypted and use only to act on your profile
            for you.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use Google user data">
        <Typography>
          We use the data we receive from Google only to provide ReplyPilot to you:
        </Typography>
        <ul>
          <li>to show your reviews in your inbox and your dashboard;</li>
          <li>to draft replies to your reviews with AI, for you to check and change;</li>
          <li>
            to post, edit or delete a reply on Google when you or a colleague in your workspace
            choose to. ReplyPilot never posts a reply nobody approved;
          </li>
          <li>
            to tell you when Google publishes or turns down a reply, or when access needs fixing.
          </li>
        </ul>
        <Typography>
          We don&apos;t sell Google user data, use it for advertising, or use it to train AI models,
          ours or anyone else&apos;s. Our staff can see it only when you ask us for help, when it is
          needed for security, or when the law requires it.
        </Typography>
        <Typography>
          ReplyPilot&apos;s use and transfer to any other app of information received from Google
          APIs will adhere to the{' '}
          <Link
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener"
          >
            Google API Services User Data Policy
          </Link>
          , including the Limited Use requirements.
        </Typography>
      </Section>

      <Section title="4. AI drafting">
        <Typography>
          To draft a reply, we send the review (its text, rating and the reviewer&apos;s name), your
          reply voice settings and a few of your recent replies to our AI provider, OpenAI. OpenAI
          processes this only to return the draft, under terms that don&apos;t allow it to train its
          models on that data. Drafts are suggestions: please read each one before you post it.
        </Typography>
      </Section>
    </LegalPage>
  );
}
