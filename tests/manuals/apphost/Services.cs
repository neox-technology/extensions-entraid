using Neox.Aspire.Hosting.Azure;

namespace Neox.Extensions.EntraId.Manuals.AppHost;

internal static class Services {
    public static IResourceBuilder<ProjectResource> Api { get; private set; } = null!;

    public static void Configure(
        IDistributedApplicationBuilder builder,
        IResourceBuilder<ParameterResource> tenantId,
        IResourceBuilder<ParameterResource> subscriptionId) {
        var clientSecret = builder.AddParameter($"{ServiceNames.Auth.Web}-client-secret", secret: true);

        Api = builder.AddProject<Projects.Neox_Extensions_EntraId_Manuals_Api>(ServiceNames.Services.Api)
            .WithExternalHttpEndpoints()
            .WithMicrosoftIdentityWebApplication(EntraIdInstance.Workforce, Auth.WebApp, clientSecret)
            .WithEnvironment("AzureAd__TenantId", tenantId)
            .WithEnvironment("Azure__SubscriptionId", subscriptionId);
    }
}
