using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Identity.Client;

namespace Neox.Extensions.EntraId.AspNetCore.Tests;

public sealed class EntraConsentExceptionHandlerTests {

    [Fact]
    public async Task TryHandleAsync_KeepsAdminConsentWithoutClientId() {
        var http = CreateHttpContext(clientId: null);

        var handled = await new EntraConsentExceptionHandler().TryHandleAsync(
            http,
            new InvalidOperationException("AADSTS90094"),
            CancellationToken.None);

        var body = await ReadBody(http);

        Assert.True(handled);
        Assert.Equal("admin_consent_required", body.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("access_denied", "consent_denied")]
    [InlineData("consent_required", "consent_required")]
    [InlineData("interaction_required", "interaction_required")]
    public async Task TryHandleAsync_WritesCodeWithoutRewritingScopes(string errorCode, string expected) {
        var http = CreateHttpContext(clientId: null);

        var handled = await new EntraConsentExceptionHandler().TryHandleAsync(
            http,
            new MsalServiceException(errorCode, errorCode),
            CancellationToken.None);

        var body = await ReadBody(http);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status401Unauthorized, http.Response.StatusCode);
        Assert.Equal(expected, body.GetProperty("code").GetString());
        Assert.Empty(body.GetProperty("scopes").EnumerateArray());
    }

    [Fact]
    public async Task TryHandleAsync_KeepsClaimsChallenge() {
        var http = CreateHttpContext("app-id");

        var handled = await new EntraConsentExceptionHandler().TryHandleAsync(
            http,
            ConsentExceptionFactory.Ui("interaction_required", "claims", "raw-claims"),
            CancellationToken.None);

        var body = await ReadBody(http);

        Assert.True(handled);
        Assert.Equal("claims_challenge", body.GetProperty("code").GetString());
        Assert.Equal("raw-claims", body.GetProperty("claims").GetString());
        Assert.Empty(body.GetProperty("scopes").EnumerateArray());
    }

    [Theory]
    [InlineData("consent_required")]
    [InlineData("AADSTS90094")]
    public async Task TryHandleAsync_RewritesConsentToApiDefaultScope(string marker) {
        var http = CreateHttpContext("app-id");
        Exception exception = marker.StartsWith("AADSTS", StringComparison.Ordinal)
            ? new InvalidOperationException(marker)
            : new MsalServiceException(marker, marker);

        var handled = await new EntraConsentExceptionHandler().TryHandleAsync(
            http,
            exception,
            CancellationToken.None);

        var body = await ReadBody(http);
        var scopes = body.GetProperty("scopes");

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status401Unauthorized, http.Response.StatusCode);
        Assert.Equal("consent_required", body.GetProperty("code").GetString());
        Assert.Equal(1, scopes.GetArrayLength());
        Assert.Equal("api://app-id/.default", scopes[0].GetString());
    }

    [Fact]
    public async Task TryHandleAsync_ReturnsFalseForUnknownException() {
        var http = CreateHttpContext(clientId: null);

        var handled = await new EntraConsentExceptionHandler().TryHandleAsync(
            http,
            new InvalidOperationException("other"),
            CancellationToken.None);

        Assert.False(handled);
        Assert.Equal(StatusCodes.Status200OK, http.Response.StatusCode);
    }

    private static DefaultHttpContext CreateHttpContext(string? clientId) {
        var values = new Dictionary<string, string?>();

        if (clientId is not null) {
            values["AzureAd:ClientId"] = clientId;
        }

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(values).Build());

        var http = new DefaultHttpContext {
            RequestServices = services.BuildServiceProvider(),
        };
        http.Response.Body = new MemoryStream();

        return http;
    }

    private static async Task<JsonElement> ReadBody(HttpContext http) {
        http.Response.Body.Position = 0;
        using var document = await JsonDocument.ParseAsync(http.Response.Body);

        return document.RootElement.Clone();
    }
}
