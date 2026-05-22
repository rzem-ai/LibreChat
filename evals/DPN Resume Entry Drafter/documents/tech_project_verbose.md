# Cloud Migration — Long Description

So I need a DPN entry for my cloud migration project. Here are the details, sorry if it's a bit all over the place:

**Client:** TelstraVox (it's a subsidiary of a large telco)
**Project name:** Enterprise Cloud Landing Zone Build
**My role:** Cloud Infrastructure Consultant

The dates were a bit weird — I started on the 15th of January 2023 and finished on 03/07-03/11/25. Actually wait, let me correct that. The whole engagement ran from 01/2023 – 03/2025 but I was only on it from Jan 2023 to September 2024. So use January 2023 – September 2024.

**Industry:** Technology, Media & Telecommunications

**What the project was about:**
TelstraVox wanted to move their entire on-premises data centre (about 450 VMs, 80 databases, and a bunch of legacy middleware) to Azure. They'd tried once before with another consultancy and failed because they didn't have proper landing zones or governance in place. We came in to do it properly — Infrastructure as Code, proper network segmentation, identity federation, the works.

**What I personally did:**
- Designed and deployed Azure Landing Zones using Terraform modules (hub-spoke network topology with 12 spoke subscriptions)
- Built the CI/CD pipelines in Azure DevOps for infrastructure deployment — reduced provisioning time from 3 weeks to 2 hours
- Wrote the cloud governance framework including tagging standards, RBAC model, and cost management policies
- Ran the weekly architecture review board and presented options papers to the CTO
- Mentored 3 junior engineers on IaC best practices and conducted code reviews on all Terraform PRs
- Led the disaster recovery design — RPO/RTO analysis for all Tier 1 applications

**Technologies:** Azure, Terraform, Azure DevOps, PowerShell, ARM Templates, Kubernetes (AKS), Docker, Git, Ansible, Python scripting, Azure Policy, Microsoft Entra ID
