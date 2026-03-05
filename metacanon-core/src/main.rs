use metacanon_ai::ui::{
    create_task_sub_sphere, delete_workflow, enable_runtime_auto_snapshot,
    finalize_setup_compute_selection, flush_runtime_auto_snapshot, get_compute_options,
    get_install_review_summary, get_observability_status, get_provider_health,
    get_security_persistence_settings, get_sub_sphere_list, get_workflow_list,
    load_runtime_snapshot, run_system_check, save_runtime_snapshot, save_trained_workflow,
    set_global_compute_provider, set_provider_priority, start_workflow_training,
    submit_deliberation, submit_training_message, update_observability_settings,
    update_provider_config, update_security_persistence_settings, UiCommandError, UiCommandRuntime,
};
use serde_json::json;
use std::env;
use std::path::Path;

const DEFAULT_CLI_SMOKE_QUERY: &str = "Return a one-line installer verification status.";

#[derive(Debug, Clone)]
struct CommandOptions {
    snapshot_path: String,
    load_existing: bool,
}

impl Default for CommandOptions {
    fn default() -> Self {
        Self {
            snapshot_path: default_snapshot_path(),
            load_existing: true,
        }
    }
}

#[derive(Debug, Clone, Default)]
struct SetupOptions {
    common: CommandOptions,
    global_provider: Option<String>,
    cloud_priority: Option<Vec<String>>,
    openai_key: Option<String>,
    anthropic_key: Option<String>,
    moonshot_key: Option<String>,
    grok_key: Option<String>,
    grok_live: bool,
    smoke_query: Option<String>,
    snapshot_encryption: Option<bool>,
    snapshot_passphrase: Option<String>,
    auto_save: Option<bool>,
    secret_backend_mode: Option<String>,
    retention_days: Option<u32>,
    log_level: Option<String>,
}

#[derive(Debug, Clone)]
struct DeliberateOptions {
    common: CommandOptions,
    query: String,
    provider_override: Option<String>,
}

#[derive(Debug, Clone)]
struct SubSphereCreateOptions {
    common: CommandOptions,
    name: String,
    objective: String,
    hitl_required: bool,
}

#[derive(Debug, Clone)]
struct WorkflowStartOptions {
    common: CommandOptions,
    sub_sphere_id: String,
}

#[derive(Debug, Clone)]
struct WorkflowMessageOptions {
    common: CommandOptions,
    session_id: String,
    message: String,
}

#[derive(Debug, Clone)]
struct WorkflowSaveOptions {
    common: CommandOptions,
    session_id: String,
    workflow_name: String,
}

#[derive(Debug, Clone)]
struct WorkflowListOptions {
    common: CommandOptions,
    sub_sphere_id: String,
}

#[derive(Debug, Clone)]
struct WorkflowDeleteOptions {
    common: CommandOptions,
    sub_sphere_id: String,
    workflow_id: String,
}

#[derive(Debug, Clone)]
enum CliCommand {
    Help,
    Setup(Box<SetupOptions>),
    Health(CommandOptions),
    SystemCheck(CommandOptions),
    Review(CommandOptions),
    Deliberate(DeliberateOptions),
    SubSphereCreate(SubSphereCreateOptions),
    SubSphereList(CommandOptions),
    WorkflowStart(WorkflowStartOptions),
    WorkflowMessage(WorkflowMessageOptions),
    WorkflowSave(WorkflowSaveOptions),
    WorkflowList(WorkflowListOptions),
    WorkflowDelete(WorkflowDeleteOptions),
    SnapshotSave(CommandOptions),
    SnapshotLoad(CommandOptions),
    SnapshotFlush(CommandOptions),
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if let Err(error) = run_cli(args) {
        eprintln!("error: {error}");
        eprintln!();
        print_help();
        std::process::exit(1);
    }
}

fn run_cli(args: Vec<String>) -> Result<(), String> {
    let command = parse_command(&args)?;
    match command {
        CliCommand::Help => {
            print_help();
            Ok(())
        }
        CliCommand::Setup(options) => run_setup(*options),
        CliCommand::Health(options) => run_health(options),
        CliCommand::SystemCheck(options) => run_system_check_command(options),
        CliCommand::Review(options) => run_review(options),
        CliCommand::Deliberate(options) => run_deliberate(options),
        CliCommand::SubSphereCreate(options) => run_sub_sphere_create(options),
        CliCommand::SubSphereList(options) => run_sub_sphere_list(options),
        CliCommand::WorkflowStart(options) => run_workflow_start(options),
        CliCommand::WorkflowMessage(options) => run_workflow_message(options),
        CliCommand::WorkflowSave(options) => run_workflow_save(options),
        CliCommand::WorkflowList(options) => run_workflow_list(options),
        CliCommand::WorkflowDelete(options) => run_workflow_delete(options),
        CliCommand::SnapshotSave(options) => run_snapshot_save(options),
        CliCommand::SnapshotLoad(options) => run_snapshot_load(options),
        CliCommand::SnapshotFlush(options) => run_snapshot_flush(options),
    }
}

fn parse_command(args: &[String]) -> Result<CliCommand, String> {
    if args.len() <= 1 {
        return Ok(CliCommand::Help);
    }

    match args[1].as_str() {
        "help" | "--help" | "-h" => Ok(CliCommand::Help),
        "setup" => Ok(CliCommand::Setup(Box::new(parse_setup_options(&args[2..])?))),
        "health" => Ok(CliCommand::Health(parse_common_options(&args[2..])?)),
        "system-check" => Ok(CliCommand::SystemCheck(parse_common_options(&args[2..])?)),
        "review" => Ok(CliCommand::Review(parse_common_options(&args[2..])?)),
        "deliberate" => Ok(CliCommand::Deliberate(parse_deliberate_options(&args[2..])?)),
        "sub-sphere-create" => Ok(CliCommand::SubSphereCreate(parse_sub_sphere_create_options(
            &args[2..],
        )?)),
        "sub-sphere-list" => Ok(CliCommand::SubSphereList(parse_common_options(&args[2..])?)),
        "workflow-start" => Ok(CliCommand::WorkflowStart(parse_workflow_start_options(
            &args[2..],
        )?)),
        "workflow-message" => Ok(CliCommand::WorkflowMessage(parse_workflow_message_options(
            &args[2..],
        )?)),
        "workflow-save" => Ok(CliCommand::WorkflowSave(parse_workflow_save_options(&args[2..])?)),
        "workflow-list" => Ok(CliCommand::WorkflowList(parse_workflow_list_options(&args[2..])?)),
        "workflow-delete" => Ok(CliCommand::WorkflowDelete(parse_workflow_delete_options(
            &args[2..],
        )?)),
        "snapshot-save" => Ok(CliCommand::SnapshotSave(parse_common_options(&args[2..])?)),
        "snapshot-load" => Ok(CliCommand::SnapshotLoad(parse_common_options(&args[2..])?)),
        "snapshot-flush" => Ok(CliCommand::SnapshotFlush(parse_common_options(&args[2..])?)),
        unknown => Err(format!(
            "unknown command '{unknown}'. expected one of: setup, health, system-check, review, deliberate, sub-sphere-create, sub-sphere-list, workflow-start, workflow-message, workflow-save, workflow-list, workflow-delete, snapshot-save, snapshot-load, snapshot-flush, help"
        )),
    }
}

fn parse_common_options(args: &[String]) -> Result<CommandOptions, String> {
    let mut options = CommandOptions::default();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => {
                options.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?
            }
            "--load-existing" => options.load_existing = true,
            "--no-load-existing" => options.load_existing = false,
            "-h" | "--help" => return Err("help requested".to_string()),
            other => return Err(format!("unknown option '{other}'")),
        }
        index += 1;
    }
    Ok(options)
}

fn parse_setup_options(args: &[String]) -> Result<SetupOptions, String> {
    let mut options = SetupOptions::default();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => {
                options.common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?
            }
            "--load-existing" => options.common.load_existing = true,
            "--no-load-existing" => options.common.load_existing = false,
            "--provider" => {
                options.global_provider = Some(take_flag_value(args, &mut index, "--provider")?)
            }
            "--cloud-priority" => {
                let raw = take_flag_value(args, &mut index, "--cloud-priority")?;
                let parsed = raw
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string)
                    .collect::<Vec<_>>();
                if parsed.is_empty() {
                    return Err(
                        "--cloud-priority must include at least one provider id".to_string()
                    );
                }
                options.cloud_priority = Some(parsed);
            }
            "--openai-key" => {
                options.openai_key = Some(take_flag_value(args, &mut index, "--openai-key")?)
            }
            "--anthropic-key" => {
                options.anthropic_key = Some(take_flag_value(args, &mut index, "--anthropic-key")?)
            }
            "--moonshot-key" => {
                options.moonshot_key = Some(take_flag_value(args, &mut index, "--moonshot-key")?)
            }
            "--grok-key" => {
                options.grok_key = Some(take_flag_value(args, &mut index, "--grok-key")?)
            }
            "--grok-live" => options.grok_live = true,
            "--smoke-query" => {
                options.smoke_query = Some(take_flag_value(args, &mut index, "--smoke-query")?)
            }
            "--snapshot-encryption" => options.snapshot_encryption = Some(true),
            "--no-snapshot-encryption" => options.snapshot_encryption = Some(false),
            "--snapshot-passphrase" => {
                options.snapshot_passphrase =
                    Some(take_flag_value(args, &mut index, "--snapshot-passphrase")?)
            }
            "--auto-save" => options.auto_save = Some(true),
            "--no-auto-save" => options.auto_save = Some(false),
            "--secret-backend" => {
                options.secret_backend_mode =
                    Some(take_flag_value(args, &mut index, "--secret-backend")?)
            }
            "--retention-days" => {
                let raw = take_flag_value(args, &mut index, "--retention-days")?;
                let parsed = raw.parse::<u32>().map_err(|_| {
                    "--retention-days must be an integer greater than zero".to_string()
                })?;
                options.retention_days = Some(parsed);
            }
            "--log-level" => {
                options.log_level = Some(take_flag_value(args, &mut index, "--log-level")?)
            }
            "-h" | "--help" => return Err("help requested".to_string()),
            other => return Err(format!("unknown setup option '{other}'")),
        }
        index += 1;
    }
    Ok(options)
}

fn parse_deliberate_options(args: &[String]) -> Result<DeliberateOptions, String> {
    let mut common = CommandOptions::default();
    let mut query: Option<String> = None;
    let mut provider_override = None;

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?,
            "--load-existing" => common.load_existing = true,
            "--no-load-existing" => common.load_existing = false,
            "--provider" => {
                provider_override = Some(take_flag_value(args, &mut index, "--provider")?)
            }
            "--query" => query = Some(take_flag_value(args, &mut index, "--query")?),
            token if token.starts_with('-') => {
                return Err(format!("unknown deliberate option '{token}'"))
            }
            token => {
                if query.is_some() {
                    return Err(format!("unexpected extra argument '{token}'"));
                }
                query = Some(token.to_string());
            }
        }
        index += 1;
    }

    let query = query.ok_or_else(|| "missing query for deliberate command".to_string())?;
    if query.trim().is_empty() {
        return Err("query must not be empty".to_string());
    }

    Ok(DeliberateOptions {
        common,
        query,
        provider_override,
    })
}

fn parse_sub_sphere_create_options(args: &[String]) -> Result<SubSphereCreateOptions, String> {
    let mut common = CommandOptions::default();
    let mut name: Option<String> = None;
    let mut objective: Option<String> = None;
    let mut hitl_required = false;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?,
            "--load-existing" => common.load_existing = true,
            "--no-load-existing" => common.load_existing = false,
            "--name" => name = Some(take_flag_value(args, &mut index, "--name")?),
            "--objective" => objective = Some(take_flag_value(args, &mut index, "--objective")?),
            "--hitl-required" => hitl_required = true,
            "--no-hitl-required" => hitl_required = false,
            other => return Err(format!("unknown sub-sphere-create option '{other}'")),
        }
        index += 1;
    }

    let name = name.ok_or_else(|| "--name is required".to_string())?;
    if name.trim().is_empty() {
        return Err("--name must not be empty".to_string());
    }
    let objective = objective.ok_or_else(|| "--objective is required".to_string())?;
    if objective.trim().is_empty() {
        return Err("--objective must not be empty".to_string());
    }

    Ok(SubSphereCreateOptions {
        common,
        name,
        objective,
        hitl_required,
    })
}

fn parse_workflow_start_options(args: &[String]) -> Result<WorkflowStartOptions, String> {
    let mut common = CommandOptions::default();
    let mut sub_sphere_id: Option<String> = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?,
            "--load-existing" => common.load_existing = true,
            "--no-load-existing" => common.load_existing = false,
            "--sub-sphere-id" => {
                sub_sphere_id = Some(take_flag_value(args, &mut index, "--sub-sphere-id")?)
            }
            other => return Err(format!("unknown workflow-start option '{other}'")),
        }
        index += 1;
    }

    let sub_sphere_id = sub_sphere_id.ok_or_else(|| "--sub-sphere-id is required".to_string())?;
    if sub_sphere_id.trim().is_empty() {
        return Err("--sub-sphere-id must not be empty".to_string());
    }
    Ok(WorkflowStartOptions {
        common,
        sub_sphere_id,
    })
}

fn parse_workflow_message_options(args: &[String]) -> Result<WorkflowMessageOptions, String> {
    let mut common = CommandOptions::default();
    let mut session_id: Option<String> = None;
    let mut message: Option<String> = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?,
            "--load-existing" => common.load_existing = true,
            "--no-load-existing" => common.load_existing = false,
            "--session-id" => session_id = Some(take_flag_value(args, &mut index, "--session-id")?),
            "--message" => message = Some(take_flag_value(args, &mut index, "--message")?),
            other => return Err(format!("unknown workflow-message option '{other}'")),
        }
        index += 1;
    }

    let session_id = session_id.ok_or_else(|| "--session-id is required".to_string())?;
    if session_id.trim().is_empty() {
        return Err("--session-id must not be empty".to_string());
    }
    let message = message.ok_or_else(|| "--message is required".to_string())?;
    if message.trim().is_empty() {
        return Err("--message must not be empty".to_string());
    }
    Ok(WorkflowMessageOptions {
        common,
        session_id,
        message,
    })
}

fn parse_workflow_save_options(args: &[String]) -> Result<WorkflowSaveOptions, String> {
    let mut common = CommandOptions::default();
    let mut session_id: Option<String> = None;
    let mut workflow_name: Option<String> = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?,
            "--load-existing" => common.load_existing = true,
            "--no-load-existing" => common.load_existing = false,
            "--session-id" => session_id = Some(take_flag_value(args, &mut index, "--session-id")?),
            "--name" => workflow_name = Some(take_flag_value(args, &mut index, "--name")?),
            other => return Err(format!("unknown workflow-save option '{other}'")),
        }
        index += 1;
    }

    let session_id = session_id.ok_or_else(|| "--session-id is required".to_string())?;
    if session_id.trim().is_empty() {
        return Err("--session-id must not be empty".to_string());
    }
    let workflow_name = workflow_name.ok_or_else(|| "--name is required".to_string())?;
    if workflow_name.trim().is_empty() {
        return Err("--name must not be empty".to_string());
    }
    Ok(WorkflowSaveOptions {
        common,
        session_id,
        workflow_name,
    })
}

fn parse_workflow_list_options(args: &[String]) -> Result<WorkflowListOptions, String> {
    let mut common = CommandOptions::default();
    let mut sub_sphere_id: Option<String> = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?,
            "--load-existing" => common.load_existing = true,
            "--no-load-existing" => common.load_existing = false,
            "--sub-sphere-id" => {
                sub_sphere_id = Some(take_flag_value(args, &mut index, "--sub-sphere-id")?)
            }
            other => return Err(format!("unknown workflow-list option '{other}'")),
        }
        index += 1;
    }

    let sub_sphere_id = sub_sphere_id.ok_or_else(|| "--sub-sphere-id is required".to_string())?;
    if sub_sphere_id.trim().is_empty() {
        return Err("--sub-sphere-id must not be empty".to_string());
    }
    Ok(WorkflowListOptions {
        common,
        sub_sphere_id,
    })
}

fn parse_workflow_delete_options(args: &[String]) -> Result<WorkflowDeleteOptions, String> {
    let mut common = CommandOptions::default();
    let mut sub_sphere_id: Option<String> = None;
    let mut workflow_id: Option<String> = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => common.snapshot_path = take_flag_value(args, &mut index, "--snapshot")?,
            "--load-existing" => common.load_existing = true,
            "--no-load-existing" => common.load_existing = false,
            "--sub-sphere-id" => {
                sub_sphere_id = Some(take_flag_value(args, &mut index, "--sub-sphere-id")?)
            }
            "--workflow-id" => {
                workflow_id = Some(take_flag_value(args, &mut index, "--workflow-id")?)
            }
            other => return Err(format!("unknown workflow-delete option '{other}'")),
        }
        index += 1;
    }

    let sub_sphere_id = sub_sphere_id.ok_or_else(|| "--sub-sphere-id is required".to_string())?;
    if sub_sphere_id.trim().is_empty() {
        return Err("--sub-sphere-id must not be empty".to_string());
    }
    let workflow_id = workflow_id.ok_or_else(|| "--workflow-id is required".to_string())?;
    if workflow_id.trim().is_empty() {
        return Err("--workflow-id must not be empty".to_string());
    }
    Ok(WorkflowDeleteOptions {
        common,
        sub_sphere_id,
        workflow_id,
    })
}

fn take_flag_value(args: &[String], index: &mut usize, flag: &str) -> Result<String, String> {
    let next = *index + 1;
    if next >= args.len() {
        return Err(format!("missing value for {flag}"));
    }
    *index = next;
    Ok(args[next].clone())
}

fn run_setup(options: SetupOptions) -> Result<(), String> {
    let snapshot_exists = Path::new(&options.common.snapshot_path).is_file();
    let runtime = if options.common.load_existing {
        UiCommandRuntime::new_with_auto_snapshot(options.common.snapshot_path.clone())
            .map_err(render_ui_error)?
    } else {
        let runtime = UiCommandRuntime::new();
        enable_runtime_auto_snapshot(&runtime, options.common.snapshot_path.clone(), false)
            .map_err(render_ui_error)?;
        runtime
    };

    if options.common.load_existing && snapshot_exists {
        if let Some(provider_id) = options.global_provider.clone() {
            set_global_compute_provider(&runtime, provider_id).map_err(render_ui_error)?;
        }
    } else {
        finalize_setup_compute_selection(&runtime, options.global_provider.clone())
            .map_err(render_ui_error)?;
    }

    if let Some(priority) = options.cloud_priority.clone() {
        set_provider_priority(&runtime, priority).map_err(render_ui_error)?;
    }

    apply_api_key_patch(
        &runtime,
        "openai",
        resolve_secret(options.openai_key.clone(), &["OPENAI_API_KEY"]),
    )?;
    apply_api_key_patch(
        &runtime,
        "anthropic",
        resolve_secret(options.anthropic_key.clone(), &["ANTHROPIC_API_KEY"]),
    )?;
    apply_api_key_patch(
        &runtime,
        "moonshot_kimi",
        resolve_secret(
            options.moonshot_key.clone(),
            &["MOONSHOT_KIMI_API_KEY", "MOONSHOT_API_KEY"],
        ),
    )?;
    apply_api_key_patch(
        &runtime,
        "grok",
        resolve_secret(options.grok_key.clone(), &["GROK_API_KEY", "XAI_API_KEY"]),
    )?;

    if options.grok_live {
        update_provider_config(&runtime, "grok".to_string(), json!({"live_api": true}))
            .map_err(render_ui_error)?;
    }

    if let Some(smoke_query) = options.smoke_query.clone() {
        let result = submit_deliberation(&runtime, smoke_query, None).map_err(render_ui_error)?;
        println!(
            "smoke query provider={} model={} fallback={} output={}",
            result.provider_id, result.model, result.used_fallback, result.output_text
        );
    }

    let current_security = get_security_persistence_settings(&runtime).map_err(render_ui_error)?;
    let desired_security = update_security_persistence_settings(
        &runtime,
        options.common.snapshot_path.clone(),
        options
            .snapshot_encryption
            .unwrap_or(current_security.encryption_enabled),
        options.snapshot_passphrase.clone(),
        options
            .auto_save
            .unwrap_or(current_security.auto_save_enabled),
        options
            .secret_backend_mode
            .clone()
            .unwrap_or(current_security.secret_backend_mode),
    )
    .map_err(render_ui_error)?;

    let current_observability = get_observability_status(&runtime).map_err(render_ui_error)?;
    let observability = update_observability_settings(
        &runtime,
        options
            .retention_days
            .unwrap_or(current_observability.retention_days),
        options
            .log_level
            .clone()
            .unwrap_or(current_observability.log_level),
    )
    .map_err(render_ui_error)?;

    let _ = flush_runtime_auto_snapshot(&runtime).map_err(render_ui_error)?;
    let options_after = get_compute_options(&runtime).map_err(render_ui_error)?;
    let health = get_provider_health(&runtime).map_err(render_ui_error)?;
    let system_check = run_system_check(&runtime).map_err(render_ui_error)?;
    let review = get_install_review_summary(&runtime).map_err(render_ui_error)?;

    println!("setup completed");
    println!("snapshot_path={}", options.common.snapshot_path);
    println!(
        "observability: retention={} log_level={} full_encrypted={} redacted_graph={}",
        observability.retention_days,
        observability.log_level,
        observability.full_tier_encrypted,
        observability.redacted_graph_feed_enabled
    );
    println!(
        "security: auto_save={} encryption_enabled={} backend={} passphrase_configured={}",
        desired_security.auto_save_enabled,
        desired_security.encryption_enabled,
        desired_security.secret_backend_mode,
        desired_security.passphrase_configured
    );
    println!("providers:");
    for option in options_after {
        println!(
            "- {} selected={} configured={} available={}",
            option.provider_id, option.selected_global, option.configured, option.available
        );
    }
    println!("health:");
    for status in health {
        println!(
            "- {} healthy={} configured={} detail={}",
            status.provider_id,
            status.is_healthy,
            status.configured,
            status.detail.unwrap_or_else(|| "none".to_string())
        );
    }
    println!(
        "system-check: blocking_failures={} warns={} fails={}",
        system_check.has_blocking_failures, system_check.warn_count, system_check.fail_count
    );
    println!(
        "review: can_install={} issues={}",
        review.can_install,
        review.issues.len()
    );
    Ok(())
}

fn run_health(options: CommandOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options).map_err(render_ui_error)?;
    let health = get_provider_health(&runtime).map_err(render_ui_error)?;
    let observability = get_observability_status(&runtime).map_err(render_ui_error)?;

    println!("provider health:");
    for status in health {
        println!(
            "- {} kind={} healthy={} configured={} detail={}",
            status.provider_id,
            status.kind,
            status.is_healthy,
            status.configured,
            status.detail.unwrap_or_else(|| "none".to_string())
        );
    }
    println!(
        "observability: retention={} log_level={} full={} redacted={}",
        observability.retention_days,
        observability.log_level,
        observability.full_tier_encrypted,
        observability.redacted_graph_feed_enabled
    );
    Ok(())
}

fn run_system_check_command(options: CommandOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options).map_err(render_ui_error)?;
    let report = run_system_check(&runtime).map_err(render_ui_error)?;

    println!(
        "system-check: blocking_failures={} warns={} fails={}",
        report.has_blocking_failures, report.warn_count, report.fail_count
    );
    for check in report.checks {
        println!(
            "- {} status={} blocking={} detail={}",
            check.label, check.status, check.blocking, check.detail
        );
    }
    Ok(())
}

fn run_review(options: CommandOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options).map_err(render_ui_error)?;
    let summary = get_install_review_summary(&runtime).map_err(render_ui_error)?;

    println!("can_install={}", summary.can_install);
    println!("global_provider={}", summary.global_provider_id);
    println!("provider_chain={}", summary.provider_chain.join(" -> "));
    println!(
        "security: auto_save={} encryption={} backend={}",
        summary.security.auto_save_enabled,
        summary.security.encryption_enabled,
        summary.security.secret_backend_mode
    );
    println!(
        "observability: retention={} log_level={}",
        summary.observability.retention_days, summary.observability.log_level
    );
    println!("issues={}", summary.issues.len());
    for issue in summary.issues {
        println!("- {} {}", issue.severity, issue.message);
    }
    Ok(())
}

fn run_deliberate(options: DeliberateOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options.common).map_err(render_ui_error)?;
    let result = submit_deliberation(&runtime, options.query, options.provider_override)
        .map_err(render_ui_error)?;

    println!("requested_provider={}", result.requested_provider_id);
    println!("provider={}", result.provider_id);
    println!("model={}", result.model);
    println!("used_fallback={}", result.used_fallback);
    println!("output={}", result.output_text);
    Ok(())
}

fn run_sub_sphere_create(options: SubSphereCreateOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options.common).map_err(render_ui_error)?;
    let created = create_task_sub_sphere(
        &runtime,
        options.name.trim().to_string(),
        options.objective.trim().to_string(),
        options.hitl_required,
    )
    .map_err(render_ui_error)?;
    let _ = save_runtime_snapshot(&runtime, options.common.snapshot_path.clone())
        .map_err(render_ui_error)?;
    println!(
        "sub-sphere created id={} name={} status={:?} hitl_required={}",
        created.sub_sphere_id, created.name, created.status, created.hitl_required
    );
    Ok(())
}

fn run_sub_sphere_list(options: CommandOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options).map_err(render_ui_error)?;
    let entries = get_sub_sphere_list(&runtime).map_err(render_ui_error)?;
    println!("sub-spheres={}", entries.len());
    for entry in entries {
        println!(
            "- id={} name={} status={:?} hitl_required={} objective={}",
            entry.sub_sphere_id, entry.name, entry.status, entry.hitl_required, entry.objective
        );
    }
    Ok(())
}

fn run_workflow_start(options: WorkflowStartOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options.common).map_err(render_ui_error)?;
    let session =
        start_workflow_training(&runtime, options.sub_sphere_id).map_err(render_ui_error)?;
    let _ = save_runtime_snapshot(&runtime, options.common.snapshot_path.clone())
        .map_err(render_ui_error)?;
    println!(
        "workflow session started session_id={} sub_sphere_id={}",
        session.session_id, session.sub_sphere_id
    );
    Ok(())
}

fn run_workflow_message(options: WorkflowMessageOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options.common).map_err(render_ui_error)?;
    submit_training_message(&runtime, options.session_id.clone(), options.message)
        .map_err(render_ui_error)?;
    let _ = save_runtime_snapshot(&runtime, options.common.snapshot_path.clone())
        .map_err(render_ui_error)?;
    println!(
        "training message accepted session_id={}",
        options.session_id
    );
    Ok(())
}

fn run_workflow_save(options: WorkflowSaveOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options.common).map_err(render_ui_error)?;
    let workflow =
        save_trained_workflow(&runtime, options.session_id.clone(), options.workflow_name)
            .map_err(render_ui_error)?;
    let _ = save_runtime_snapshot(&runtime, options.common.snapshot_path.clone())
        .map_err(render_ui_error)?;
    println!(
        "workflow saved workflow_id={} sub_sphere_id={} name={} steps={}",
        workflow.workflow_id,
        workflow.sub_sphere_id,
        workflow.workflow_name,
        workflow.steps.len()
    );
    Ok(())
}

fn run_workflow_list(options: WorkflowListOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options.common).map_err(render_ui_error)?;
    let workflows =
        get_workflow_list(&runtime, options.sub_sphere_id.clone()).map_err(render_ui_error)?;
    println!(
        "workflows={} sub_sphere_id={}",
        workflows.len(),
        options.sub_sphere_id
    );
    for workflow in workflows {
        println!(
            "- workflow_id={} name={} steps={}",
            workflow.workflow_id,
            workflow.workflow_name,
            workflow.steps.len()
        );
    }
    Ok(())
}

fn run_workflow_delete(options: WorkflowDeleteOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options.common).map_err(render_ui_error)?;
    delete_workflow(
        &runtime,
        options.sub_sphere_id.clone(),
        options.workflow_id.clone(),
    )
    .map_err(render_ui_error)?;
    let _ = save_runtime_snapshot(&runtime, options.common.snapshot_path.clone())
        .map_err(render_ui_error)?;
    println!(
        "workflow deleted workflow_id={} sub_sphere_id={}",
        options.workflow_id, options.sub_sphere_id
    );
    Ok(())
}

fn run_snapshot_save(options: CommandOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options).map_err(render_ui_error)?;
    let saved = save_runtime_snapshot(&runtime, options.snapshot_path).map_err(render_ui_error)?;
    println!(
        "snapshot saved path={} schema_version={} sub_spheres={} workflows={}",
        saved.path, saved.schema_version, saved.task_sub_sphere_count, saved.workflow_count
    );
    Ok(())
}

fn run_snapshot_load(options: CommandOptions) -> Result<(), String> {
    let runtime = UiCommandRuntime::new();
    let loaded = load_runtime_snapshot(&runtime, options.snapshot_path).map_err(render_ui_error)?;
    println!(
        "snapshot loaded path={} schema_version={} sub_spheres={} workflows={}",
        loaded.path, loaded.schema_version, loaded.task_sub_sphere_count, loaded.workflow_count
    );
    Ok(())
}

fn run_snapshot_flush(options: CommandOptions) -> Result<(), String> {
    let runtime = runtime_from_snapshot_options(&options).map_err(render_ui_error)?;
    enable_runtime_auto_snapshot(&runtime, options.snapshot_path, options.load_existing)
        .map_err(render_ui_error)?;
    match flush_runtime_auto_snapshot(&runtime).map_err(render_ui_error)? {
        Some(result) => {
            println!(
                "snapshot flushed path={} schema_version={} sub_spheres={} workflows={}",
                result.path,
                result.schema_version,
                result.task_sub_sphere_count,
                result.workflow_count
            );
        }
        None => println!("auto snapshot is disabled"),
    }
    Ok(())
}

fn runtime_from_snapshot_options(
    options: &CommandOptions,
) -> Result<UiCommandRuntime, UiCommandError> {
    if options.load_existing && Path::new(&options.snapshot_path).is_file() {
        UiCommandRuntime::new_with_auto_snapshot(options.snapshot_path.clone())
    } else {
        Ok(UiCommandRuntime::new())
    }
}

fn apply_api_key_patch(
    runtime: &UiCommandRuntime,
    provider_id: &str,
    api_key: Option<String>,
) -> Result<(), String> {
    let Some(api_key) = api_key else {
        return Ok(());
    };
    update_provider_config(
        runtime,
        provider_id.to_string(),
        json!({
            "api_key": api_key
        }),
    )
    .map_err(render_ui_error)?;
    Ok(())
}

fn resolve_secret(flag_value: Option<String>, env_keys: &[&str]) -> Option<String> {
    if let Some(flag_value) = flag_value {
        if !flag_value.trim().is_empty() {
            return Some(flag_value);
        }
    }

    for key in env_keys {
        if let Ok(value) = env::var(key) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn default_snapshot_path() -> String {
    if let Ok(home) = env::var("HOME") {
        return format!("{home}/.metacanon_ai/runtime_snapshot.json");
    }
    ".metacanon_ai/runtime_snapshot.json".to_string()
}

fn render_ui_error(error: UiCommandError) -> String {
    error.to_string()
}

fn print_help() {
    println!("MetaCanon installer/runtime CLI");
    println!();
    println!("usage:");
    println!("  metacanon setup [options]");
    println!("  metacanon health [options]");
    println!("  metacanon system-check [options]");
    println!("  metacanon review [options]");
    println!("  metacanon deliberate <query> [options]");
    println!("  metacanon sub-sphere-create --name <name> --objective <objective> [--hitl-required] [options]");
    println!("  metacanon sub-sphere-list [options]");
    println!("  metacanon workflow-start --sub-sphere-id <id> [options]");
    println!("  metacanon workflow-message --session-id <id> --message <text> [options]");
    println!("  metacanon workflow-save --session-id <id> --name <workflow_name> [options]");
    println!("  metacanon workflow-list --sub-sphere-id <id> [options]");
    println!("  metacanon workflow-delete --sub-sphere-id <id> --workflow-id <id> [options]");
    println!("  metacanon snapshot-save [options]");
    println!("  metacanon snapshot-load [options]");
    println!("  metacanon snapshot-flush [options]");
    println!("  metacanon help");
    println!();
    println!("common options:");
    println!(
        "  --snapshot <path>         snapshot path (default: $HOME/.metacanon_ai/runtime_snapshot.json)"
    );
    println!("  --load-existing           load existing snapshot state (default)");
    println!("  --no-load-existing        start from fresh runtime state");
    println!();
    println!("setup options:");
    println!("  --provider <id>           set global provider (qwen_local, ollama, morpheus, openai, anthropic, moonshot_kimi, grok)");
    println!("  --cloud-priority <csv>    set cloud fallback order (example: openai,anthropic,moonshot_kimi,grok)");
    println!("  --openai-key <key>        set OpenAI API key");
    println!("  --anthropic-key <key>     set Anthropic API key");
    println!("  --moonshot-key <key>      set Moonshot Kimi API key");
    println!("  --grok-key <key>          set xAI Grok API key");
    println!("  --grok-live               enable live Grok transport");
    println!("  --smoke-query <text>      run a smoke deliberation query after setup");
    println!("  --snapshot-encryption     enable encrypted snapshot mode");
    println!("  --no-snapshot-encryption  disable encrypted snapshot mode");
    println!("  --snapshot-passphrase <p> configure snapshot encryption passphrase");
    println!("  --auto-save               enable automatic snapshot persistence");
    println!("  --no-auto-save            disable automatic snapshot persistence");
    println!("  --secret-backend <mode>   keychain_only | encrypted_file_only | dual_write");
    println!("  --retention-days <n>      observability retention in days (>0)");
    println!("  --log-level <level>       error | warn | info | debug | trace");
    println!();
    println!("deliberate options:");
    println!("  --provider <id>           per-request provider override");
    println!("  --query <text>            explicit query field (alternative to positional query)");
    println!();
    println!("sub-sphere/workflow options:");
    println!("  sub-sphere-create: --name, --objective, --hitl-required|--no-hitl-required");
    println!("  workflow-start: --sub-sphere-id");
    println!("  workflow-message: --session-id, --message");
    println!("  workflow-save: --session-id, --name");
    println!("  workflow-list: --sub-sphere-id");
    println!("  workflow-delete: --sub-sphere-id, --workflow-id");
    println!();
    println!("env vars used if key flags are omitted:");
    println!("  OPENAI_API_KEY, ANTHROPIC_API_KEY, MOONSHOT_KIMI_API_KEY|MOONSHOT_API_KEY, GROK_API_KEY|XAI_API_KEY");
    println!();
    println!("example quick setup:");
    println!(
        "  GROK_API_KEY=... metacanon setup --provider qwen_local --grok-live --smoke-query \"{}\"",
        DEFAULT_CLI_SMOKE_QUERY
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_options_parse_cloud_priority() {
        let parsed = parse_setup_options(&[
            "--cloud-priority".to_string(),
            "openai,anthropic,grok".to_string(),
            "--grok-live".to_string(),
        ])
        .expect("setup options should parse");

        assert_eq!(
            parsed.cloud_priority,
            Some(vec![
                "openai".to_string(),
                "anthropic".to_string(),
                "grok".to_string()
            ])
        );
        assert!(parsed.grok_live);
    }

    #[test]
    fn deliberate_options_require_query() {
        let error = parse_deliberate_options(&[]).expect_err("query should be required");
        assert!(error.contains("missing query"));
    }

    #[test]
    fn setup_options_parse_security_and_observability_flags() {
        let parsed = parse_setup_options(&[
            "--snapshot-encryption".to_string(),
            "--snapshot-passphrase".to_string(),
            "top-secret".to_string(),
            "--no-auto-save".to_string(),
            "--secret-backend".to_string(),
            "dual_write".to_string(),
            "--retention-days".to_string(),
            "120".to_string(),
            "--log-level".to_string(),
            "debug".to_string(),
        ])
        .expect("setup options should parse");

        assert_eq!(parsed.snapshot_encryption, Some(true));
        assert_eq!(parsed.snapshot_passphrase, Some("top-secret".to_string()));
        assert_eq!(parsed.auto_save, Some(false));
        assert_eq!(parsed.secret_backend_mode, Some("dual_write".to_string()));
        assert_eq!(parsed.retention_days, Some(120));
        assert_eq!(parsed.log_level, Some("debug".to_string()));
    }

    #[test]
    fn parse_command_supports_system_check_and_review() {
        let system_check = parse_command(&["metacanon".to_string(), "system-check".to_string()])
            .expect("system-check should parse");
        assert!(matches!(system_check, CliCommand::SystemCheck(_)));

        let review =
            parse_command(&["metacanon".to_string(), "review".to_string()]).expect("review parse");
        assert!(matches!(review, CliCommand::Review(_)));
    }

    #[test]
    fn parse_sub_sphere_create_options_requires_name_and_objective() {
        let options = parse_sub_sphere_create_options(&[
            "--name".to_string(),
            "Research Ops".to_string(),
            "--objective".to_string(),
            "Build a policy synthesis pipeline".to_string(),
            "--hitl-required".to_string(),
        ])
        .expect("sub-sphere create options should parse");

        assert_eq!(options.name, "Research Ops");
        assert_eq!(options.objective, "Build a policy synthesis pipeline");
        assert!(options.hitl_required);
    }

    #[test]
    fn parse_command_supports_workflow_training_commands() {
        let start = parse_command(&[
            "metacanon".to_string(),
            "workflow-start".to_string(),
            "--sub-sphere-id".to_string(),
            "sub-sphere-1".to_string(),
        ])
        .expect("workflow-start should parse");
        assert!(matches!(start, CliCommand::WorkflowStart(_)));

        let message = parse_command(&[
            "metacanon".to_string(),
            "workflow-message".to_string(),
            "--session-id".to_string(),
            "wf-session-1".to_string(),
            "--message".to_string(),
            "capture this behavior".to_string(),
        ])
        .expect("workflow-message should parse");
        assert!(matches!(message, CliCommand::WorkflowMessage(_)));

        let save = parse_command(&[
            "metacanon".to_string(),
            "workflow-save".to_string(),
            "--session-id".to_string(),
            "wf-session-1".to_string(),
            "--name".to_string(),
            "Training Loop".to_string(),
        ])
        .expect("workflow-save should parse");
        assert!(matches!(save, CliCommand::WorkflowSave(_)));
    }
}
