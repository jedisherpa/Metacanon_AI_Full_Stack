'''
# API & Integration Reference

**Last Updated:** February 12, 2026

This document provides a reference for the APIs, embed codes, and webhooks used in your projects as discussed in this thread.

---

## 1. GoHighLevel (GHL) Form Embeds

These are HTML iframe codes used to embed lead capture and application forms directly into your websites. To use them, you paste the `<iframe>` and `<script>` code into the HTML of your webpage where you want the form to appear.

### Form 1: Website Email Signup

This form is a general-purpose email list opt-in.

*   **Form ID**: `X6w9NjjA1we01mKU00Rq`
*   **Used On**: `re-self.com` (Homepage bottom & Coming Soon page)

**Embed Code:**
```html
<iframe
    src="https://api.leadconnectorhq.com/widget/form/X6w9NjjA1we01mKU00Rq"
    style="width:100%;height:100%;border:none;border-radius:3px"
    id="inline-X6w9NjjA1we01mKU00Rq" 
    data-layout='''{"id":"INLINE"}'''
    data-trigger-type="alwaysShow"
    data-trigger-value=""
    data-activation-type="alwaysActivated"
    data-activation-value=""
    data-deactivation-type="neverDeactivate"
    data-deactivation-value=""
    data-form-name="Website Email Signup"
    data-height="431"
    data-layout-iframe-id="inline-X6w9NjjA1we01mKU00Rq"
    data-form-id="X6w9NjjA1we01mKU00Rq"
    title="Website Email Signup"
        >
</iframe>
<script src="https://link.msgsndr.com/js/form_embed.js"></script>
```

### Form 2: Re-Selfing Application Form

This is the detailed application form for the Re-Selfing program, which includes payment processing.

*   **Form ID**: `NWWyB0gEpi8xvMHWfo06`
*   **Used On**: `re-self.com` (Sacred Gateway "Enter This Path" buttons)

**Direct Link:**

This form is used as a direct link rather than an embed. The URL is:
```
https://api.leadconnectorhq.com/widget/form/NWWyB0gEpi8xvMHWfo06
```

---

## 2. Vercel Deploy Hook for `re-self`

A deploy hook is a unique URL that triggers a new Vercel deployment for a specific project and Git branch when a `POST` request is made to it. This is useful for forcing a redeployment when Vercel's automatic Git integration is delayed or needs to be bypassed.

*   **Project**: `re-self`
*   **Branch**: `main`

**How to Use:**

To trigger a new deployment for the `re-self` site, you can run the following command in your terminal. This sends an empty `POST` request to the hook URL, which is all that's needed to start the build.

```bash
curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_qdZ4sU2qw9gY8s4v4R4A4gY8s4v4/r4gY8s4v4"
```

After running this command, you can check the [Vercel dashboard](https://vercel.com/jediserpas-projects/re-self/deployments) to monitor the progress of the new deployment.
'''
