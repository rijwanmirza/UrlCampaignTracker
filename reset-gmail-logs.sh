#!/bin/bash

# Reset Gmail tracking logs to fix the email deletion issue
echo "Clearing processed_emails.log file..."
> processed_emails.log
echo "Processed emails log has been reset."

echo "Now restart the application to apply changes."