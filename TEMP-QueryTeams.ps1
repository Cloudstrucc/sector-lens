# ============================================================
# Teams Hardening Diagnostic Script
# Run from Azure Cloud Shell (PowerShell mode)
# ============================================================
# BEFORE RUNNING:
#   Connect-AzAccount -UseDeviceAuthentication
#   Connect-MicrosoftTeams
# ============================================================

$ErrorActionPreference = "Continue"

# ─────────────────────────────────────────
# ACQUIRE USER TOKEN FOR GRAPH
# ─────────────────────────────────────────
Write-Host "`nAcquiring Graph token..." -ForegroundColor Cyan

try {
    $tokenObj = Get-AzAccessToken -ResourceUrl "https://graph.microsoft.com" -ErrorAction Stop

    if ($tokenObj.Token -is [System.Security.SecureString]) {
        $graphToken = [System.Net.NetworkCredential]::new("", $tokenObj.Token).Password
    } else {
        $graphToken = $tokenObj.Token
    }

    if (-not $graphToken.StartsWith("eyJ") -or ($graphToken.Split(".")).Count -ne 3) {
        throw "Token does not appear to be a valid JWT"
    }

    if ($tokenObj.UserId -like "MSI@*" -or $tokenObj.UserId -like "msi@*") {
        Write-Host "" 
        Write-Host "  WARNING: Token is from Managed Service Identity (MSI), not your user account." -ForegroundColor Red
        Write-Host "  Please run first: Connect-AzAccount -UseDeviceAuthentication" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "  Token acquired successfully" -ForegroundColor Green
    Write-Host "  Account   : $($tokenObj.UserId)" -ForegroundColor Green
    Write-Host "  Tenant ID : $($tokenObj.TenantId)" -ForegroundColor Green

} catch {
    Write-Host "  ERROR acquiring token: $_" -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────
# HELPER — REST call with user token
# Pass -Beta to use /beta endpoint
# ─────────────────────────────────────────
function Invoke-TenantGraphRequest {
    param(
        [string]$Uri,
        [switch]$Beta
    )
    # Allow caller to pass a full URI or just a path
    if ($Uri -notlike "https://*") {
        $base = if ($Beta) { "https://graph.microsoft.com/beta" } else { "https://graph.microsoft.com/v1.0" }
        $Uri  = "$base/$($Uri.TrimStart('/'))"
    }
    try {
        $response = Invoke-RestMethod `
            -Uri $Uri `
            -Method GET `
            -Headers @{
                Authorization  = "Bearer $graphToken"
                "Content-Type" = "application/json"
            } `
            -ErrorAction Stop
        return $response
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errBody    = $_.ErrorDetails.Message
        Write-Host "  API call failed (HTTP $statusCode): $errBody" -ForegroundColor Red
        return $null
    }
}

# ─────────────────────────────────────────
# 1. CONDITIONAL ACCESS POLICIES
# ─────────────────────────────────────────
Write-Host "`n=== CONDITIONAL ACCESS POLICIES (Guests/External) ===" -ForegroundColor Cyan

$caResponse = Invoke-TenantGraphRequest -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies"

if ($caResponse) {
    $enabledPolicies = $caResponse.value | Where-Object { $_.state -eq "enabled" }
    $matchedCount    = 0

    foreach ($policy in $enabledPolicies) {
        $includeUsers  = $policy.conditions.users.includeUsers
        $includeGuests = $policy.conditions.users.includeGuestsOrExternalUsers

        if ($includeGuests -or $includeUsers -contains "All") {
            $matchedCount++
            Write-Host "`n  Policy               : $($policy.displayName)" -ForegroundColor Yellow
            Write-Host "  State                : $($policy.state)"
            Write-Host "  Targets All Users    : $($includeUsers -contains 'All')"
            Write-Host "  Guest/External Types : $($includeGuests.guestOrExternalUserTypes)"
            Write-Host "  Grant Controls       : $($policy.grantControls.builtInControls -join ', ')"
            Write-Host "  Session Controls     : $(if ($policy.sessionControls) { $policy.sessionControls | ConvertTo-Json -Compress } else { 'None' })"
        }
    }

    if ($matchedCount -eq 0) {
        Write-Host "  No CA policies found targeting guests or all users." -ForegroundColor Green
    }
    Write-Host "`n  Total enabled CA policies scanned: $($enabledPolicies.Count) | Matched: $matchedCount"
}

# ─────────────────────────────────────────
# 2. CROSS-TENANT ACCESS SETTINGS
# ─────────────────────────────────────────
Write-Host "`n=== CROSS-TENANT ACCESS - INBOUND DEFAULTS ===" -ForegroundColor Cyan

$ctResponse = Invoke-TenantGraphRequest -Uri "https://graph.microsoft.com/v1.0/policies/crossTenantAccessPolicy/default"

if ($ctResponse) {
    $mfaTrust       = $ctResponse.inboundTrust.isMfaAccepted
    $compliantTrust = $ctResponse.inboundTrust.isCompliantDeviceAccepted
    $hybridTrust    = $ctResponse.inboundTrust.isHybridAzureADJoinedDeviceAccepted

    Write-Host "  B2B Collab Inbound Enabled  : $($ctResponse.b2bCollaborationInbound.isEnabled)"
    Write-Host "  B2B Direct Connect Inbound  : $($ctResponse.b2bDirectConnectInbound.isEnabled)"
    Write-Host "  Inbound Trust - MFA         : $mfaTrust"
    Write-Host "  Inbound Trust - Compliant   : $compliantTrust"
    Write-Host "  Inbound Trust - Hybrid Join : $hybridTrust"

    if ($mfaTrust -eq $false) {
        Write-Host "`n  !! LIKELY ISSUE: Inbound MFA trust is FALSE." -ForegroundColor Red
        Write-Host "     Federated users who completed MFA on their own IdP will be re-challenged" -ForegroundColor Red
        Write-Host "     by your tenant. If their token can't satisfy that, they get blocked." -ForegroundColor Red
        Write-Host "     Fix: Set isMfaAccepted = true in cross-tenant access defaults." -ForegroundColor Red
    }
    if ($compliantTrust -eq $false) {
        Write-Host "`n  !! NOTE: Compliant device trust is FALSE." -ForegroundColor Yellow
        Write-Host "     External users on unmanaged devices will be blocked if any CA policy" -ForegroundColor Yellow
        Write-Host "     requires device compliance." -ForegroundColor Yellow
    }
}

$partnerResponse = Invoke-TenantGraphRequest -Uri "https://graph.microsoft.com/v1.0/policies/crossTenantAccessPolicy/partners"

if ($partnerResponse -and $partnerResponse.value.Count -gt 0) {
    Write-Host "`n  Per-Partner Overrides Found:" -ForegroundColor Yellow
    foreach ($partner in $partnerResponse.value) {
        Write-Host "    Tenant : $($partner.tenantId)"
        Write-Host "      Inbound MFA Trust      : $($partner.inboundTrust.isMfaAccepted)"
        Write-Host "      Inbound Compliant Trust : $($partner.inboundTrust.isCompliantDeviceAccepted)"
        Write-Host "      B2B Collab Inbound      : $($partner.b2bCollaborationInbound.isEnabled)"
    }
} else {
    Write-Host "  No per-partner overrides found."
}

# ─────────────────────────────────────────
# 3. TEAMS MEETING POLICIES
# ─────────────────────────────────────────
Write-Host "`n=== TEAMS MEETING POLICIES ===" -ForegroundColor Cyan

try {
    $meetingPolicies = Get-CsTeamsMeetingPolicy -ErrorAction Stop
    foreach ($policy in $meetingPolicies) {
        Write-Host "`n  Policy : $($policy.Identity)" -ForegroundColor Yellow
        Write-Host "  AllowAnonymousUsersToJoinMeeting   : $($policy.AllowAnonymousUsersToJoinMeeting)"
        Write-Host "  AutoAdmittedUsers (Lobby bypass)   : $($policy.AutoAdmittedUsers)"
        Write-Host "  AllowExternalParticipantGiveRequest: $($policy.AllowExternalParticipantGiveRequestControl)"
        Write-Host "  AllowPSTNUsersToBypassLobby        : $($policy.AllowPSTNUsersToBypassLobby)"
    }
} catch {
    Write-Host "  ERROR: Could not retrieve Teams meeting policies." -ForegroundColor Red
    Write-Host "  Make sure you have run: Connect-MicrosoftTeams" -ForegroundColor Yellow
    Write-Host "  Details: $_" -ForegroundColor Red
}

# ─────────────────────────────────────────
# 4. TEAMS EXTERNAL ACCESS CONFIG
# ─────────────────────────────────────────
Write-Host "`n=== TEAMS EXTERNAL ACCESS CONFIG ===" -ForegroundColor Cyan

try {
    $extAccess = Get-CsTenantFederationConfiguration -ErrorAction Stop
    Write-Host "  AllowFederatedUsers   : $($extAccess.AllowFederatedUsers)"
    Write-Host "  AllowPublicUsers      : $($extAccess.AllowPublicUsers)"
    Write-Host "  AllowTeamsConsumer    : $($extAccess.AllowTeamsConsumer)"
    Write-Host "  AllowedDomains        : $($extAccess.AllowedDomains)"
    Write-Host "  BlockedDomains        : $($extAccess.BlockedDomains)"
} catch {
    Write-Host "  ERROR retrieving federation config: $_" -ForegroundColor Red
}

# ─────────────────────────────────────────
# 5. RECENT EXTERNAL USER SIGN-IN FAILURES
#    Uses /beta endpoint — crossTenantAccessType
#    is not available in v1.0
# ─────────────────────────────────────────
Write-Host "`n=== RECENT EXTERNAL USER SIGN-IN FAILURES (last 48hrs) ===" -ForegroundColor Cyan

$myTenantId = $tokenObj.TenantId
$since      = (Get-Date).AddHours(-48).ToString("yyyy-MM-ddTHH:mm:ssZ")
$filterStr  = "createdDateTime ge $since and status/errorCode ne 0"

# Use beta for crossTenantAccessType; select only valid beta properties
$signInUri  = "https://graph.microsoft.com/beta/auditLogs/signIns?" +
              "`$filter=$([System.Web.HttpUtility]::UrlEncode($filterStr))" +
              "&`$top=50" +
              "&`$select=userPrincipalName,appDisplayName,status,createdDateTime," +
              "crossTenantAccessType,homeTenantId,appliedConditionalAccessPolicies"

$signInResponse = Invoke-TenantGraphRequest -Uri $signInUri

if ($signInResponse) {
    # Post-filter to external users only — homeTenantId differs from your tenant
    $externalFails = $signInResponse.value | Where-Object {
        $_.homeTenantId -and $_.homeTenantId -ne "" -and $_.homeTenantId -ne $myTenantId
    }

    if ($externalFails.Count -gt 0) {
        Write-Host "  Found $($externalFails.Count) external user failure(s):`n"
        foreach ($entry in $externalFails) {
            Write-Host "  User                  : $($entry.userPrincipalName)" -ForegroundColor Yellow
            Write-Host "    App                 : $($entry.appDisplayName)"
            Write-Host "    Error Code          : $($entry.status.errorCode)"
            Write-Host "    Failure Reason      : $($entry.status.failureReason)"
            Write-Host "    Timestamp           : $($entry.createdDateTime)"
            Write-Host "    Home Tenant ID      : $($entry.homeTenantId)"
            Write-Host "    Cross Tenant Access : $($entry.crossTenantAccessType)"
            $caPolicyNames = ($entry.appliedConditionalAccessPolicies |
                Where-Object { $_.result -ne "notApplied" } |
                Select-Object -ExpandProperty displayName) -join ", "
            Write-Host "    CA Policies Applied : $(if ($caPolicyNames) { $caPolicyNames } else { 'None' })"
            Write-Host ""
        }
    } else {
        Write-Host "  No external user sign-in failures found in the last 48 hours." -ForegroundColor Green
        Write-Host "  (Total sign-in failures across all users in period: $($signInResponse.value.Count))"
    }
}

# ─────────────────────────────────────────
# ERROR CODE REFERENCE
# ─────────────────────────────────────────
Write-Host "`n=== ERROR CODE REFERENCE ===" -ForegroundColor Cyan
Write-Host "  50158  -> External IdP challenge failed (cross-tenant MFA trust gap — see section 2)"
Write-Host "  53003  -> Blocked by Conditional Access — check CA Policies column above"
Write-Host "  700016 -> App not recognised in external user's tenant (federation config issue)"
Write-Host "  50097  -> Device authentication required (compliance policy blocking)"
Write-Host "  50020  -> Guest user not found in tenant (B2B invite not accepted)"
Write-Host "  90072  -> User account not in tenant — check they were invited correctly"
Write-Host ""
Write-Host "=== SCAN COMPLETE ===" -ForegroundColor Green