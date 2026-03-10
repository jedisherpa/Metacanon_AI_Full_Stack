# GHL Source Tracking Implementation Report

**Date:** 2026-02-12
**Author:** Manus AI

## 1. Objective

To implement a system that allows GoHighLevel (GHL) to track which of the 23 ecosystem websites a lead originates from. This enables the routing of leads to the correct email campaign based on their source website and the specific course they are interested in.

## 2. Research and Findings

Initial research confirmed that the standard GHL `<iframe>` embed code does not inherently capture URL parameters from the parent page. This means that simply visiting `https://www.jedisherpa.com/?source=jedisherpa` would not pass the `source` parameter to the embedded GHL form.

The most effective and straightforward solution was to directly append the necessary tracking information as query parameters to the `src` attribute of the `<iframe>` itself. GHL forms can be configured to read these parameters and populate hidden fields if the "Query Key" of the hidden field matches the query parameter name.

## 3. Implementation

The implementation involved two key steps:

### 3.1. GoHighLevel Form Configuration (User Action Required)

For this system to work, two **hidden custom fields** must be created and added to the GHL form used across all websites. The user must perform the following actions in their GHL dashboard:

1.  Navigate to **Settings** > **Custom Fields**.
2.  Create a new contact field named `source_site`.
3.  Create another new contact field named `course_interest`.
4.  Open the email opt-in form in the form builder.
5.  Add both `source_site` and `course_interest` to the form.
6.  For each of these new fields, select them, and in the right-hand settings panel:
    *   Toggle the **"Hidden"** switch to ON.
    *   Set the **"Query Key"** for the `source_site` field to `source_site`.
    *   Set the **"Query Key"** for the `course_interest` field to `course_interest`.
7.  Save the form.

### 3.2. Code Update in `EcosystemCTA.tsx`

I updated the `EcosystemCTA.tsx` component, which is shared across all 23 websites. The component now dynamically constructs the `<iframe>` source URL by appending the `sourceTag` and `courseTag` props (which are already passed to the component) as query parameters.

**Previous Code:**
```javascript
<iframe
  src="https://api.leadconnectorhq.com/widget/form/sXVcBxmHlNFt46Sul9nx"
  // ... other attributes
/>
```

**New Code:**
```javascript
const ghlFormUrl = `https://api.leadconnectorhq.com/widget/form/sXVcBxmHlNFt46Sul9nx?source_site=${encodeURIComponent(sourceTag)}&course_interest=${encodeURIComponent(courseTag)}`;

// ... later in the return statement

<iframe
  src={ghlFormUrl}
  // ... other attributes
/>
```

This change ensures that when a user visits a site (e.g., `jedisherpa.com`), the GHL form will be loaded with a URL like:
`.../sXVcBxmHlNFt46Sul9nx?source_site=jedisherpa.com&course_interest=ai-safety-checklist`

GHL will then automatically capture these values into the corresponding hidden fields on the contact record.

## 4. Deployment and Verification

The updated `EcosystemCTA.tsx` component has been successfully deployed to the main monorepo and pushed to all 23 individual GitHub repositories that are connected to Vercel. 

I have verified that the deployed websites are now serving the new code and that the `<iframe>` source URL includes the correct `source_site` and `course_interest` parameters for each respective site.

## 5. Conclusion

The source tracking implementation is now complete from a code and deployment perspective. Once the user configures the necessary hidden fields in the GoHighLevel form as described in section 3.1, the system will be fully operational. Every new lead will be automatically tagged with its originating website and the course it was associated with, allowing for precise email campaign automation.
