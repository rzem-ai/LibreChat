# RFP-Led Workflow

Use this workflow when the user provides an RFP, client brief, tender, win themes, or value proposition. This is the equivalent of the former CV Refiner app (plugin 69).

## Overview

Produces a first draft by combining the client's specific requirements (from RFP documents), the pursuit's win themes (from a value proposition, if supplied), and the individual's CV. Generates up to four output sections: General Information, Biography, Relevant Experience, and Qualifications.

## Step Sequence

### Step 1: Disclaimer

Confirm the user understands this is a first draft, all content must be accurate and used with permission, and all outputs must be reviewed and approved by the individual before external submission. Do not proceed without acknowledgement.

### Step 2: RFP / Client Documents

Ask for the RFP or other client documents (uploaded or pasted). Summarise the client ask, focusing on:

- Client needs and specific requirements
- Any resourcing requirements or specifications on CVs / professional profiles
- Key dates (list these first)
- Whether the document requires filling out a template

### Step 3: Value Proposition / Win Themes (optional)

Ask for value proposition or win theme documents (for example, a Get to Green pack or executive summary). If provided, extract the key messages, points of difference, and win themes that relate to the client ask.

If the user does not have these, offer to proceed without them after a single confirmation. Do not repeatedly request them.

### Step 4: CV and Output Style

Ask for the team member's CV (uploaded file, pasted text, or a partial excerpt) and the output style. Respect an instruction to use only a supplied excerpt; do not keep asking for the full CV.

Generate all applicable sections in a single, clearly labelled response.

## Output Styles

| Style | Description | Summary length |
|---|---|---|
| **Long form** | Detailed CV, half to full page | Full paragraph |
| **Short form** | Shortened version, quarter to third of a page | 2 to 3 sentences |
| **Bio** | Short summary of experience only | 4 to 6 sentences; no General Information, Relevant Experience, or Qualifications sections |

## Output Sections

1. **General Information** — name, Deloitte position, phone, email, and a placeholder for their role on the project. Omit for the Bio style.
2. **Biography** — third-person professional summary tailored to the client.
3. **Relevant Experience** — bulleted list of relevant client engagements tailored to the client ask and win themes. Omit for the Bio style.
4. **Qualifications** — bulleted list of qualifications, memberships, certifications, and publications. Omit for the Bio style.

## Internal Generation Prompts

### Summarise client documents (Step 2)

> Summarise the documents uploaded to Client Documents. Particularly focus on the clients' needs and specific requirements and highlight any resourcing requirements or specifications on the CVs or professional profiles. Identify and list key dates first. Indicate if the document requires the individual to fill out a template. Write your response in Australian English. Format your output using markdown.

### Summarise value proposition (Step 3)

> Review files uploaded to value prop and extract the key messages, points of difference and/or win themes that relate to [RFP Summary]. Format your response in markdown.

### General Information (Step 4, skip for Bio)

> Extract the individual's name, leave a hold for their role on the project. Include their position at Deloitte. Include phone numbers and emails. Do not perform this action if "Bio" is selected as [CV Style]. Format your response in markdown and write in Australian English. Note any missing pieces of information.

### Biography (Step 4)

> Review CV uploaded and tailor it for the needs of the client specified in [RFP Summary]. Highlight any areas that align with the key messages that are outlined in the [Value Prop Summary] and how the individual in the CV would add value to the client. The Summary should be a third-person professional summary including total years' experience, topic of expertise and specialisation. Describe industry/sector experience (i.e., Mining, Health Sciences, Construction.) (E.g. "David is a member of the national executive, and one of Deloitte's most senior audit partners.")
>
> If "Long form" is selected in [CV Style], make it a paragraph in length. If "Short form" is selected, make it 2 to 3 sentences in length. If "Bio" is selected, focus on the experience and industry expertise of the individual for 4 to 6 sentences. Use the template in the knowledge base as a guide for the style. Format your response in markdown and write in Australian English.

### Relevant Experience (Step 4, skip for Bio)

> Extract the relevant client experience in a bulleted list. List key specialisations and strengths through client perspective, highlight career focus of the individual and summarise industry/sector specialisation and experience. Include any motivation/drivers in career. The clients listed should be relevant to the industry or need of the client outlined in [RFP Summary] or highlighted in [Value Prop Summary]. Format of the response as [Client], [Role] - [1 sentence description of role]. E.g. Deloitte, Senior Partner - Led a complex, technology-enabled audit transition of an ASX listed client. Do not perform this action if "Bio" is selected as [CV Style]. Format your response in markdown and write in Australian English.

### Qualifications (Step 4, skip for Bio)

> Provide a bulleted list of any qualifications listed in the CV: Qualification name, Institute, Year. Membership level, Association. Professional development/certification, Institute. Article name, publication name, date. Conference/trade show/forum name, role, topic, year. Format your response in markdown and write in Australian English. Do not perform this action if "Bio" is selected as [CV Style].

## Accuracy and Formatting Rules

- Write in Australian English; format in markdown.
- Anonymise all organisation names; do not include project location or year.
- Do not claim industry or domain experience the CV does not evidence; describe the type of project work instead where the sector is not evidenced.
- Respect the length ceiling for the selected style.
