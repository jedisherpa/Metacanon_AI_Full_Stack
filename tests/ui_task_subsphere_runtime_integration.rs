use metacanon_ai::genesis::TaskSubSphereStatus;
use metacanon_ai::lens_library::LensLibraryTier;
use metacanon_ai::specialist_lens::SpecialistLensDefinition;
use metacanon_ai::ui::{
    add_lens_to_sub_sphere, approve_ai_contact_lens, approve_deliverable, approve_hitl_action,
    create_task_sub_sphere, dissolve_sub_sphere, get_sub_sphere_deliberation_log,
    get_sub_sphere_status, pause_sub_sphere, reject_deliverable, reject_hitl_action,
    revoke_specialist_lens, save_lens_to_library, search_lens_library, submit_sub_sphere_query,
    UiCommandError, UiCommandRuntime,
};
use serde_json::Value;

fn build_lens_definition(
    lens_definition_id: &str,
    name: &str,
    requires_hitl_approval: bool,
) -> SpecialistLensDefinition {
    SpecialistLensDefinition {
        lens_definition_id: lens_definition_id.to_string(),
        name: name.to_string(),
        objective: "Assess implications and summarize impact".to_string(),
        capability_tags: vec!["analysis".to_string()],
        tool_allowlist: vec![],
        requires_hitl_approval,
    }
}

#[test]
fn ui_runtime_task_subsphere_lifecycle_approve_path_e2e() {
    let runtime = UiCommandRuntime::new();

    let created = create_task_sub_sphere(
        &runtime,
        "Policy Ops".to_string(),
        "Evaluate policy deltas".to_string(),
        true,
    )
    .expect("sub-sphere should be created");

    let lens = add_lens_to_sub_sphere(
        &runtime,
        created.sub_sphere_id.clone(),
        build_lens_definition("def-policy", "Policy Lens", false),
        Value::Null,
    )
    .expect("lens should be added");

    approve_ai_contact_lens(
        &runtime,
        created.sub_sphere_id.clone(),
        lens.lens_id.clone(),
        "Stay within local analysis scope.".to_string(),
    )
    .expect("lens approval should succeed");

    let query_result = submit_sub_sphere_query(
        &runtime,
        created.sub_sphere_id.clone(),
        "Compare current governance policy with previous revision.".to_string(),
        Some("ollama".to_string()),
    )
    .expect("query should run");

    assert!(query_result.pending_action_id.is_some());

    let deliberation_log =
        get_sub_sphere_deliberation_log(&runtime, created.sub_sphere_id.clone(), 10, 0)
            .expect("deliberation log should load");
    assert_eq!(deliberation_log.len(), 1);
    assert_eq!(
        deliberation_log[0].deliberation_id,
        query_result.deliberation_id
    );

    approve_hitl_action(
        &runtime,
        created.sub_sphere_id.clone(),
        query_result
            .pending_action_id
            .expect("pending action id should be present"),
    )
    .expect("HITL approval should succeed");

    approve_deliverable(
        &runtime,
        created.sub_sphere_id.clone(),
        query_result.deliverable_id.clone(),
    )
    .expect("deliverable approval should succeed");

    let entry = save_lens_to_library(
        &runtime,
        created.sub_sphere_id.clone(),
        lens.lens_id,
        LensLibraryTier::LocalPrivate,
    )
    .expect("lens should be saved");
    assert!(!entry.entry_id.is_empty());

    let search = search_lens_library(
        &runtime,
        "policy".to_string(),
        Some(LensLibraryTier::LocalPrivate),
        Vec::new(),
    )
    .expect("lens search should succeed");
    assert_eq!(search.len(), 1);

    pause_sub_sphere(&runtime, created.sub_sphere_id.clone()).expect("pause should succeed");
    assert_eq!(
        get_sub_sphere_status(&runtime, created.sub_sphere_id.clone())
            .expect("paused status should load"),
        TaskSubSphereStatus::Paused
    );

    dissolve_sub_sphere(
        &runtime,
        created.sub_sphere_id.clone(),
        "work completed".to_string(),
    )
    .expect("dissolve should succeed");
    assert_eq!(
        get_sub_sphere_status(&runtime, created.sub_sphere_id)
            .expect("dissolved status should load"),
        TaskSubSphereStatus::Dissolved
    );
}

#[test]
fn ui_runtime_task_subsphere_reject_path_and_pause_gate_e2e() {
    let runtime = UiCommandRuntime::new();

    let created = create_task_sub_sphere(
        &runtime,
        "Compliance".to_string(),
        "Run compliance checks".to_string(),
        false,
    )
    .expect("sub-sphere should be created");

    let lens = add_lens_to_sub_sphere(
        &runtime,
        created.sub_sphere_id.clone(),
        build_lens_definition("def-compliance", "Compliance Lens", true),
        Value::Null,
    )
    .expect("lens should be added");

    approve_ai_contact_lens(
        &runtime,
        created.sub_sphere_id.clone(),
        lens.lens_id.clone(),
        "Use only approved compliance process.".to_string(),
    )
    .expect("lens approval should succeed");

    let query_result = submit_sub_sphere_query(
        &runtime,
        created.sub_sphere_id.clone(),
        "Identify policy exceptions in this proposal.".to_string(),
        None,
    )
    .expect("query should run");
    assert!(query_result.pending_action_id.is_some());

    reject_hitl_action(
        &runtime,
        created.sub_sphere_id.clone(),
        query_result
            .pending_action_id
            .expect("pending action should be present"),
        "insufficient evidence".to_string(),
    )
    .expect("rejecting pending action should succeed");

    reject_deliverable(
        &runtime,
        created.sub_sphere_id.clone(),
        query_result.deliverable_id,
        "needs stronger source grounding".to_string(),
    )
    .expect("explicit deliverable rejection should succeed");

    revoke_specialist_lens(
        &runtime,
        created.sub_sphere_id.clone(),
        lens.lens_id,
        "retiring this lens".to_string(),
    )
    .expect("lens revocation should succeed");

    pause_sub_sphere(&runtime, created.sub_sphere_id.clone()).expect("pause should succeed");

    let paused_query = submit_sub_sphere_query(
        &runtime,
        created.sub_sphere_id,
        "Run one more analysis".to_string(),
        None,
    )
    .expect_err("paused sub-sphere should reject query");

    match paused_query {
        UiCommandError::TaskSubSphereRuntime { message } => {
            assert!(message.contains("not active"));
        }
        other => panic!("unexpected error variant: {other:?}"),
    }
}
