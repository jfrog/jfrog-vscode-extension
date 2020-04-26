package com.jfrog.ide;

import org.apache.maven.artifact.Artifact;
import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;

import java.io.File;

@Mojo(name = "gav")
public class MavenGavReader extends AbstractMojo {
    @Parameter(property = "project.parentArtifact")
    private Artifact parent;

    @Parameter(property = "project.artifact")
    private Artifact artifact;

    @Parameter(property = "project.file")
    private File file;

    public void execute() {
        String gav = getGavString(artifact);
        String parentGav = getGavString(parent);
        String pomPath = file.getAbsolutePath();
        System.out.printf("{\"gav\":\"%s\",\"parentGav\":\"%s\",\"pomPath\":\"%s\"}%n", gav, parentGav, pomPath);
    }

    private static String getGavString(Artifact artifact) {
        if (artifact == null) {
            return "";
        }
        return String.format("%s:%s:%s", artifact.getGroupId(), artifact.getArtifactId(), artifact.getVersion());
    }
}
