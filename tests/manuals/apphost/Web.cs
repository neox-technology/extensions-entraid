using Aspire.Hosting.JavaScript;
using Neox.Aspire.Hosting.Azure;

namespace Neox.Extensions.EntraId.Manuals.AppHost;

internal static class Web {
    public static IResourceBuilder<ViteAppResource> Spa { get; private set; } = null!;

    public static void Configure(IDistributedApplicationBuilder builder, IResourceBuilder<ParameterResource> tenantId) {
        Spa = builder.AddViteApp(ServiceNames.Web.Spa, "../spa")
            .WithExternalHttpEndpoints()
            .WithReference(Services.Api)
            .WaitFor(Services.Api)
            .WithEnvironment("VITE_API_BASE_URL", Services.Api.GetEndpoint("https"))
            .WithEnvironment("VITE_ENTRA_API_SCOPE", ReferenceExpression.Create($"api://{Auth.Registration.Resource.ClientId}/access_as_user"))
            .WithEnvironment("VITE_ENTRA_TenantId", tenantId)
            .WithEntraIdSpaApplication(EntraIdInstance.Workforce, Auth.SpaApp, "VITE_ENTRA_");
    }
}
