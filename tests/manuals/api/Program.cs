using System.Net.Http.Headers;
using System.Reflection;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using Neox.Extensions.EntraId;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEntraConsentExceptions();
builder.Services.AddHttpClient();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin()));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"))
    .EnableTokenAcquisitionToCallDownstreamApi()
    .AddInMemoryTokenCaches();
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/graph/me", async (ITokenAcquisition tokens, IHttpClientFactory httpFactory, CancellationToken cancellationToken) => {
    var body = await ReadGraph(tokens, httpFactory, "https://graph.microsoft.com/User.Read", "https://graph.microsoft.com/v1.0/me?$select=id,displayName", cancellationToken).ConfigureAwait(false);

    return Results.Text(body, "application/json");
}).RequireAuthorization();

app.MapGet("/graph/directory", async (ITokenAcquisition tokens, IHttpClientFactory httpFactory, CancellationToken cancellationToken) => {
    var body = await ReadGraph(tokens, httpFactory, "https://graph.microsoft.com/User.Read.All", "https://graph.microsoft.com/v1.0/users?$top=1&$select=id,displayName", cancellationToken).ConfigureAwait(false);

    return Results.Text(body, "application/json");
}).RequireAuthorization();

app.MapGet("/probe/claims", () => {
    var exception = new MsalUiRequiredException("invalid_grant", "claims challenge");
    typeof(MsalUiRequiredException)
        .GetProperty(nameof(MsalUiRequiredException.Claims), BindingFlags.Instance | BindingFlags.Public)!
        .SetValue(exception, "eyJjbGFpbXMiOiJ4In0");

    throw new MicrosoftIdentityWebChallengeUserException(exception, ["api://manuals/access_as_user"]);
}).RequireAuthorization();

app.MapGet("/probe/forbidden", () => Results.StatusCode(StatusCodes.Status403Forbidden)).RequireAuthorization();

app.MapGet("/probe/unauthorized", () => Results.Unauthorized()).RequireAuthorization();

app.Run();

static async Task<string> ReadGraph(
    ITokenAcquisition tokens,
    IHttpClientFactory httpFactory,
    string scope,
    string url,
    CancellationToken cancellationToken) {
    var accessToken = await tokens.GetAccessTokenForUserAsync([scope]).ConfigureAwait(false);
    var http = httpFactory.CreateClient();
    using var request = new HttpRequestMessage(HttpMethod.Get, url);
    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    using var response = await http.SendAsync(request, cancellationToken).ConfigureAwait(false);
    var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

    if (!response.IsSuccessStatusCode) {
        throw new InvalidOperationException($"Graph {(int)response.StatusCode}: {body}");
    }

    return body;
}
