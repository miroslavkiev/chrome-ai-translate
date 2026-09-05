# Publication legal review

Checked: September 5, 2026. This is a publication checklist, not a legal opinion or a statement of compliance. It does not authorise a Store submission or disclosure of personal details.

The publisher has confirmed that this is a free personal hobby project. That fact must remain separate from whether users translate text for work. The publisher requests a visible notice of Google's use conditions, with acceptance through use rather than an eligibility checkbox or identity checks. The draft listing now contains that notice. This records the requested approach, not a finding that every publication duty is met.

## Open publication items

| Item | What must be resolved |
| --- | --- |
| Publisher details | Resolve the notice duty for this public hobby offering. If it applies, confirm the full public name and a suitable public service address, plus a public contact email. A home address is not requested and must not be added to the repository. No identity or address may be inferred from Git or account records. |
| Google eligibility | Show the use conditions before first API use and in the listing. Choose supported distribution countries. Check that the actual offering matches Google's audience and availability rules; no individual identity or billing verification system is proposed. |
| Privacy roles | Record who is responsible for each processing activity, including support and any public website. Finish the applicable privacy information. |
| Disclosure and consent | Decide what users must see and agree to before their first Google request. Keep legal consent and Store policy requirements separate. |
| Key storage | Choose and test the key-handling design. Current local extension storage is not encrypted against access to the Chrome profile. Review this against the [Store's storage-encryption requirement](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) before submission. |
| Public pages | Provide working privacy and legal-notice links with complete, approved details. The template in this folder is not a public legal notice. |

## German legal notice

[MStV section 18(1)](https://www.gesetze-bayern.de/Content/Document/MStV-18) requires name and address for online services that do not serve exclusively personal or family purposes. A public hobby release should not assume that it has this exemption. Whether the particular offering falls within scope remains a legal assessment.

For the planned individual publisher, prepare the full name and postal address. A public contact email also provides a useful support/privacy route. Email is not an extra requirement stated in MStV section 18(1) itself. [DDG section 5](https://www.gesetze-im-internet.de/ddg/__5.html) separately requires email and suitable direct contact for the business-like digital services within its scope. Do not assume that DDG section 5 applies solely because the author writes software or users use it at work.

The home address does not have to be the chosen public address. The Lower Saxony media regulator's guidance for MStV section 18 expressly allows an agency, office service, lawyer or family member's address where legal documents can validly be served. This requires a real authorisation to receive legal service, with the rights and duties agreed. A lawyer is one option, not an automatic requirement. A borrowed address, ordinary mailbox or post-office box alone is insufficient. [NLM guide, section 2.3.2](https://www.nlm.de/fileadmin/dateien/pdf/leitfaden_impressumspflicht_2024.pdf).

A standard DHL Packstation address plus a Postnummer is not a suitable substitute for this required service address. DHL describes the Postnummer as a personal customer number used to route eligible deliveries. Current Packstation rules allow some letters and registered mail, but this delivery service does not establish the authorised recipient arrangement required by the regulator. Receiving ordinary mail or identifying the account holder does not by itself make legal service at that address valid. This conclusion applies the NLM's service-address test to the standard DHL service, rather than claiming that all letters are excluded from Packstations. [DHL Packstation receiving rules](https://www.dhl.de/de/privatkunden/hilfe-kundenservice/packstation/empfangen.html), [NLM guide, section 2.3.2](https://www.nlm.de/fileadmin/dateien/pdf/leitfaden_impressumspflicht_2024.pdf).

A reviewed c/o arrangement can show the publisher's name and the authorised recipient's address instead of the home address. The c/o label alone does not create the authorisation. A complete notice can live on a separate public page linked from the product, so there is no need to commit the home address to this repository. [Media regulator guidance](https://www.medienanstalt-nrw.de/aufsicht/transparenz-im-internet.html).

If the notice duty applies, email or a contact form cannot replace the postal address. Omitting a required address leaves the notice incomplete and can lead to enforcement or a fine. The free hobby status does not by itself settle the narrow personal/family exception. A privacy-preserving next step is to ask the relevant state media authority whether this specific public utility needs the notice, or to arrange a valid service address. Do not present public release as cleared while this remains unresolved. [NLM guide, sections 2.3 and 4](https://www.nlm.de/fileadmin/dateien/pdf/leitfaden_impressumspflicht_2024.pdf).

Keep the notice easy to find from About and the public project page. Do not add company, VAT, register or editorial-officer statements unless the facts and the relevant duties require them. MStV section 18(2)'s editorial duty concerns journalistic/editorial offerings; it is not automatically a duty of this translation utility.

## Chrome trader status

The confirmed hobby purpose supports a provisional non-trader assessment. It is not an account declaration. Chrome distinguishes status by the publisher's business or professional purpose, not simply by a price or an end user's occupation. The publisher must make an accurate declaration; traders must provide information for verification. [Chrome trader policy](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure).

Do not silently change this project to trader status to address Google's separate API terms. Store status also does not replace German provider-information duties.

## Google API terms

The [Gemini terms](https://ai.google.dev/gemini-api/terms), effective March 23, 2026, limit use to developers building for professional or business purposes, rather than consumer use. They require users to be at least 18 and prohibit API clients directed at, or likely accessed by, people under 18. They also restrict availability by region and require Paid Services for API clients offered in the EEA, UK or Switzerland.

Gemini API access is a Paid Service only through a project with active billing. Separately, users in those regions receive paid data-use treatment even on unpaid quota. That privacy rule does not remove the paid-service requirement for clients.

The current bring-your-own-key design does not itself settle eligibility. Resolve the audience and Google's application of these terms before a consumer launch. Do not claim that a checkbox, free price, or user-owned key guarantees permission.

The reviewed Google clauses do not expressly require a separate checkbox, identity documents, or an independent check of each user's occupation or billing. [Google API Terms section 2(a)](https://developers.google.com/terms#section_2_using_our_apis) requires developers to require end-user compliance and not knowingly enable violations, without prescribing a particular acceptance control. The chosen approach is a visible use notice, also included in [the draft Store description](LISTING.md), without a separate eligibility checkbox. Do not label users as verified or claim the notice removes duties that apply to the app itself.

A sentence saying that use means acceptance is not a guarantee that terms are legally binding. Where [BGB section 305(2)](https://www.gesetze-im-internet.de/bgb/__305.html) applies, users need clear notice, a reasonable opportunity to read the terms, and agreement. Its application depends on the parties and circumstances. Show the conditions before use rather than relying only on a legal-notice page that users may not see.

This use notice is separate from permission to handle data. [Chrome's disclosure FAQ, question 10](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) requires a prominent in-product disclosure and a specific action clearly agreeing before data is handled. A description or legal notice alone does not meet that requirement. A clearly labelled setup button can provide that action; a checkbox is not the only possible control. The current automatic key-save and model-loading flow still needs that separate change.

## GDPR roles and information

The extension sends text directly from the user's browser to Google. It has no developer backend or analytics. This limits access, but does not alone decide GDPR roles: actual purposes and essential decisions matter, and a controller need not see the data. Assess translation, local storage, support messages and any public website separately. [EDPB controller guidance, paragraphs 40 and 45](https://www.edpb.europa.eu/system/files/documents/2023-10/EDPB_guidelines_202007_controllerprocessor_final_en.pdf).

For each activity where the publisher is a controller, finish the applicable [GDPR Article 13](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679) information:

- Identity and contact details; representative or data protection officer only if applicable.
- Purposes and legal bases; legitimate interests where that basis is used.
- Recipients, international transfers and the relevant safeguards.
- Retention periods or a clear method for determining them.
- Applicable access, correction, deletion, restriction, objection and portability rights.
- Withdrawal of consent where consent is the basis, and the right to complain to a supervisory authority.
- Whether data is required and the consequences of not providing it; relevant automated decision-making, if any.

Do not promise that Google keeps no data or processes it only in the EU. Check the applicable Google contract and international-transfer terms for the actual account/service arrangement. A user's action cannot supply consent on behalf of every person whose information appears in selected text.

If relying on consent, assess the specific purpose and information shown before the action. Consent must meet Articles 4(11) and 7: it must be informed, specific, freely given and unambiguous, and withdrawal must be as easy as giving consent. Do not treat accepting a privacy policy as a universal legal basis. Other Article 6 bases may be appropriate depending on the actual activity. [GDPR](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).

## Device storage and TDDDG

[TDDDG section 25](https://www.gesetze-im-internet.de/ttdsg/__25.html) normally requires consent for storing or accessing information on a device. Section 25(2)(2) makes an exception where this is strictly necessary to provide a digital service expressly requested by the user.

Document which key, preference and session values are necessary for the requested feature. Do not claim that every persistent cache or Chrome sync value automatically qualifies. A general cookie banner is not needed just because storage exists if a valid exception covers the relevant operation. This storage assessment does not replace the GDPR assessment for personal data or Google's terms.

## AI Act

Assess the extension as an AI system under its own published name, separately from Google's role as model provider. The current translation-only purpose does not itself show a high-risk use, but this is an assessment of the present purpose, not a general exemption. Free/open-source status does not exclude systems covered by Article 50. [AI Act Articles 2, 3, 6 and 50](https://eur-lex.europa.eu/eli/reg/2024/1689/oj).

Article 50 transparency rules apply from August 2, 2026. Keep the use of AI clear before first use. Assess whether faithful translation falls within the standard-editing or unchanged-semantics exception to machine-readable marking. Do not claim that a visible AI label alone meets a marking duty, or that every translation is automatically exempt. [Commission transparency guidance](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act).

The July amendment was verified in the official publication: [Regulation (EU) 2026/1744](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32026R1744), published July 24 and in force July 27, 2026. Article 1(39)(b) adds a December 2, 2026 marking deadline only for systems placed on the market before August 2. Do not rely on that grace period without evidence of qualifying prior availability. Article 1(40) moves the relevant high-risk duties to December 2, 2027 or August 2, 2028; it does not delay the general Article 50 date.

## Release decision

Artwork, narrower permissions, working links and accurate technical privacy text are prepared. The requested use notice is in the draft listing; its final setup placement remains to be completed. Review the four key-handling options before changing that user flow. Keep publication pending until the audience/service restriction, key protection, disclosure/consent and publisher-information items above are resolved. Recheck these sources at submission time.
