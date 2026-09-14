import { sendDueReminders } from "../src/lib/reminders";

sendDueReminders()
  .then((result) => {
    console.log("Reminders (email stub or Resend):", result);
    console.log("SMS remains TODO.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
