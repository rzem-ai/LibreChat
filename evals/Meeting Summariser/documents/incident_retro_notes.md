# Incident Retrospective Notes

Post-incident retro for the 18 Feb outage. Attendees: Liam, Sophie, Ben, and Aisha.

- Outage lasted 47 minutes (14:03–14:50 AEDT), affected payment processing for ~2,300 customers
- Root cause: database connection pool exhausted after a spike in traffic from the marketing campaign launch
- Monitoring alert fired at 14:07 but the on-call engineer (Ben) didn't see it until 14:18 because Slack notifications were muted
- Sophie's hotfix (increased pool size from 50 to 150 connections) resolved the issue within 3 minutes of deployment
- Liam pointed out we had no load testing for the campaign scenario — marketing didn't notify engineering of the launch timing
- Decision: implement a cross-team launch calendar so engineering gets 48-hour notice of campaigns
- Decision: increase default connection pool to 100 and add auto-scaling based on queue depth
- Aisha to update the runbook with the new pool settings by next Wednesday
- Ben to configure PagerDuty as backup alerting channel — Slack alone is insufficient
- Sophie to add a load test scenario for 3x normal traffic by end of sprint
- Liam to set up a fortnightly sync with marketing to review upcoming launches
- Follow-up retro in 4 weeks to check effectiveness of changes
